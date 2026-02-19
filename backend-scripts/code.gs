// Google Apps Script code // GH: HyperRushNet | MIT License | 2026
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
      const expireTime = formatTime(new Date(sentTime.getTime() + CACHE_EXPIRATION * 1000));

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
  return Math.floor(100000 + Math.random() * 900000).toString();
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
