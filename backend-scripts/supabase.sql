-- GH: HyperRushNet | MIT License | 2026
-- Execute this in your Supabase SQL Editor

-- 1. Clean Slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_message_update ON public.messages;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at CASCADE;
DROP FUNCTION IF EXISTS public.verify_room_password CASCADE;
DROP FUNCTION IF EXISTS public.set_room_password CASCADE;
DROP FUNCTION IF EXISTS public.can_access_room CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.room_passwords CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 2. Create Tables
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

-- 3. Create Indexes
CREATE INDEX idx_messages_room_id_created_at ON public.messages(room_id, created_at DESC);
CREATE INDEX idx_rooms_created_by ON public.rooms(created_by);
CREATE INDEX idx_profiles_id ON public.profiles(id);
CREATE INDEX idx_rooms_allowed_users ON public.rooms USING GIN (allowed_users);

-- 4. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "rooms_select_visible" ON public.rooms FOR SELECT USING (
    auth.uid() = created_by 
    OR allowed_users @> ARRAY[auth.uid()::text]
    OR allowed_users @> ARRAY['*']
);

CREATE POLICY "rooms_insert_authenticated" ON public.rooms FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' 
    AND auth.uid() = created_by
);

CREATE POLICY "rooms_delete_policy" ON public.rooms FOR DELETE USING (
    auth.uid() = created_by 
    OR (is_direct = true AND allowed_users @> ARRAY[auth.uid()::text])
);

CREATE POLICY "rooms_update_creator" ON public.rooms FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "room_passwords_block_direct" ON public.room_passwords FOR ALL USING (false);

CREATE POLICY "messages_select_room" ON public.messages FOR SELECT USING (
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

CREATE POLICY "messages_insert_authenticated" ON public.messages FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = user_id
);

-- UPDATE POLICY: Allow editing within 15 mins OR setting content to '/' for deletion anytime
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id 
    AND (
        content = '/' 
        OR created_at > now() - interval '15 minutes'
    )
);

-- 6. Create Functions & Triggers
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
AS $$ BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
 $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_message_update
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

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
AS $$ DECLARE
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

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
