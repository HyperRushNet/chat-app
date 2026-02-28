# HRN Chat 2026 – v1.0.5 

A private, encrypted chat app that runs directly in your browser.  
No apps to install. Strong privacy. Real-time. Offline capable.

## Core Promises

- Messages are end-to-end encrypted — only you and the recipient can read them
- The server never sees your message content
- Works offline: read old messages even without internet
- Stays logged in on trusted devices
- Clean, fast, no-nonsense interface

## Features

- One-time email code login (expires in 10 minutes)
- Public open rooms + private password-protected rooms
- Direct messages (1-on-1)
- Edit or delete your messages (within 15 minutes)
- See who is online right now (per room + total)
- Message copying with one tap
- Beautiful automatic date headers (Today • Yesterday • Monday • 15 Feb 2026)
- Fully readable offline (previously received messages)
- Minimal iOS-style design, smooth on mobile and desktop
- Works in any modern browser — no installation needed

## Security

- Encryption happens in your browser only
- No readable messages are ever stored on the server
- Room passwords are checked without ever sending them to your device
- Only one active tab at a time (prevents login confusion)
- Designed to feel safe and predictable

## Deploy Guide

This guide explains how to deploy HRN Chat 2026 step by step.

### Frontend (Static Hosting)

The frontend is a simple static site: HTML + JS + assets.

Recommended hosts:
- Vercel (easiest if you also host backend there)
- GitHub Pages
- Netlify
- Cloudflare Pages
- Any other static file host

Steps:
1. Fork or clone the repository.
2. Upload / serve these files from the root:
   - index.html
   - assets/ (everything inside)
   - sw.js

3. Open index.html and update the config variables at the top:
   - supabaseUrl
   - supabaseKey
   - mailApi (your email API endpoint from below)

4. Deploy / push — done. No build step required.

Tip: When using Vercel for the frontend, you can deploy the same repo — it auto-detects as static.

---

### Backend

#### Vercel (Serverless Functions + Proxy)

Use this for the API layer (CORS proxy + email trigger).

[<image-card alt="Deploy with Vercel" src="https://vercel.com/button" ></image-card>](https://vercel.com/new/clone?repository-url=https://github.com/HyperRushNet/chat-app)

Note: Vercel imports the default branch (usually main).  
After importing:
- Go to Project Settings → Git
- Change Production Branch to 1.0.5
- Save → Vercel will build version 1.0.5

After deployment, copy your Vercel function URL (e.g. https://your-project.vercel.app/api/mailAPI) and use it as mailApi in the frontend config.

---

#### Supabase (Database + Auth + Realtime)

1. Create a new Supabase project (free tier is sufficient).
2. Go to SQL Editor → New query.
3. Paste and run this full SQL script:

```sql
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL DEFAULT 'User',
    avatar_url text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    avatar_url text,
    has_password boolean NOT NULL DEFAULT false,
    is_visible boolean NOT NULL DEFAULT true,
    is_direct boolean NOT NULL DEFAULT false,
    salt text NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    allowed_users text[] NOT NULL DEFAULT '{*}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.room_passwords (
    room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    password_hash text NOT NULL
);

CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name text NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX idx_messages_room_id_created_at ON public.messages(room_id, created_at DESC);
CREATE INDEX idx_rooms_created_by ON public.rooms(created_by);
CREATE INDEX idx_profiles_id ON public.profiles(id);
CREATE INDEX idx_rooms_allowed_users ON public.rooms USING GIN (allowed_users);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY rooms_select_visible ON public.rooms FOR SELECT USING (
    auth.uid() = created_by
    OR allowed_users @> ARRAY[auth.uid()::text]
    OR allowed_users @> ARRAY['*']
);

CREATE POLICY rooms_insert_authenticated ON public.rooms FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = created_by
);

CREATE POLICY rooms_delete_policy ON public.rooms FOR DELETE USING (
    auth.uid() = created_by
    OR (is_direct = true AND allowed_users @> ARRAY[auth.uid()::text])
);

CREATE POLICY rooms_update_creator ON public.rooms FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY room_passwords_block_direct ON public.room_passwords FOR ALL USING (false);

CREATE POLICY messages_select_room ON public.messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = messages.room_id
        AND (
            rooms.created_by = auth.uid()
            OR rooms.allowed_users @> ARRAY['*']
            OR rooms.allowed_users @> ARRAY[auth.uid()::text]
        )
    )
);

CREATE POLICY messages_insert_authenticated ON public.messages FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = user_id
);

CREATE POLICY messages_update_own ON public.messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND (
        content = '/'
        OR created_at > now() - interval '15 minutes'
    )
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$    
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'User'),
        NEW.raw_user_meta_data ->> 'avatar_url',
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(NEW.raw_user_meta_data ->> 'full_name', profiles.full_name),
        avatar_url = COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', profiles.avatar_url),
        updated_at = NOW();
    RETURN NEW;
END;
    $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$    
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
    $$;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_message_update ON public.messages;
CREATE TRIGGER on_message_update
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_room_password(p_room_id uuid, p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$    
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.rooms
        WHERE id = p_room_id AND created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    IF p_hash IS NULL THEN
        DELETE FROM public.room_passwords WHERE room_id = p_room_id;
    ELSE
        INSERT INTO public.room_passwords (room_id, password_hash)
        VALUES (p_room_id, p_hash)
        ON CONFLICT (room_id)
        DO UPDATE SET password_hash = EXCLUDED.password_hash;
    END IF;
END;
    $$;

CREATE OR REPLACE FUNCTION public.verify_room_password(p_room_id uuid, p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$    
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.room_passwords
        WHERE room_id = p_room_id
        AND password_hash = p_hash
    );
END;
    $$;

CREATE OR REPLACE FUNCTION public.can_access_room(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$    
DECLARE
    r_allowed text[];
    r_creator uuid;
BEGIN
    SELECT allowed_users, created_by
    INTO r_allowed, r_creator
    FROM public.rooms
    WHERE id = p_room_id;
    IF r_creator IS NULL THEN RETURN false; END IF;
    IF r_creator = auth.uid() THEN RETURN true; END IF;
    IF r_allowed @> ARRAY[auth.uid()::text] THEN RETURN true; END IF;
    IF r_allowed @> ARRAY['*'] THEN RETURN true; END IF;
    RETURN false;
END;
    $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
```

4. Go to Authentication → Providers and disable "Confirm email".
5. Copy your Project URL and anon key (from Settings → API).
6. Paste them into the frontend config in index.html.

---

#### Google Apps Script (OTP Email Delivery)

1. Go to https://script.new to create a new project.
2. Replace the default code in code.gs with this full script:

```gs
const CACHE_EXPIRATION = 10 * 60;
const RATE_LIMIT_SECONDS = 60;

function doGet(e) {
  return respond({ message: "API Online" });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const email = data.email;
    if (!email || !action) return respond({ message: "Invalid request" });
    const cache = CacheService.getScriptCache();
    const rateKey = "RATE_" + email;
    if (action === "send") {
      const lastSent = cache.get(rateKey);
      if (lastSent) return respond({ message: "Too many requests. Wait a moment." });
      const code = generateCode();
      saveCode(email, code);
      cache.put(rateKey, "1", RATE_LIMIT_SECONDS);
      const sentTime = new Date();
      const expireTime = formatTime(new Date(sentTime.getTime() + CACHE_EXPIRATION * 1```));
      const htmlBody = `
<div style="max-width:520px;margin:0 auto;padding:32px;font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#111;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.05);text-align:center;">
  <h2 style="margin:0 0 16px;font-size:22px;display:inline-flex;align-items:center;gap:10px;justify-content:center;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
    Verification Code
  </h2>
  <p style="margin:0 0 24px;font-size:15px;color:#555;">
    Here’s your HRN Chat verification code:
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;">
  <div style="margin:0 0 24px;">
    <span style="display:inline-block;padding:16px 28px;font-size:28px;letter-spacing:5px;font-weight:bold;background:#f9f9fb;border-radius:12px;border:1px solid #ececec;">
      ${code}
    </span>
  </div>
  <p style="margin:0 0 24px;font-size:13px;color:#777;">
    This code is valid for 10 minutes, until ${expireTime}.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#aaa;margin:0;">
    If you didn’t request this, you can safely ignore this email.
  </p>
</div>`;
      try {
        MailApp.sendEmail({
          to: email,
          subject: "🔒 HRN Chat - Verification Code",
          htmlBody: htmlBody
        });
      } catch (mailErr) {
        return respond({ message: "Mail sending failed: " + mailErr.message });
      }
      return respond({ message: "Code sent" });
    }
    if (action === "verify") {
      const userCode = data.code;
      if (!userCode) return respond({ message: "No code provided" });
      const valid = checkCode(email, userCode);
      if (valid === true) return respond({ message: "Verified" });
      return respond({ message: "Invalid code" });
    }
    return respond({ message: "Invalid action" });
  } catch (err) {
    return respond({ message: "Error: " + err.message });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("");
}

function generateCode() {
  return Math.floor(1```00 + Math.random() * 9```00).toString();
}

function saveCode(email, code) {
  const cache = CacheService.getScriptCache();
  const key = "VER_" + email;
  cache.put(key, code, CACHE_EXPIRATION);
}

function checkCode(email, code) {
  const cache = CacheService.getScriptCache();
  const key = "VER_" + email;
  const cachedCode = cache.get(key);
  if (!cachedCode) return false;
  if (cachedCode === code.toString()) {
    cache.remove(key);
    return true;
  }
  return false;
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2,'0');
  const m = String(date.getMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}
```

3. Click Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
4. Copy the Web app URL (ends with /exec).
5. Use this URL as mailApi in your frontend config (or proxy it via Vercel if preferred).

---

Done! After updating the config in index.html, you can log in, receive OTPs, and start chatting.

Enjoy HRN Chat 2026!
