export default async function handler(req, res) {
  // 1. Forceer CORS headers voor ELKE request
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Beantwoord Preflight direct
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Alleen POST toestaan
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyjjYmri3_TTlcRANHZLR-IghRbslxY2C-T7eJ7UzY2lPr7KN0Sv0HES7gKreT_IRcI/exec";

  try {
    const body = req.body;
    const url = req.url || "";
    
    // Bepaal actie: check eerst URL, dan de body
    let action = body.action;
    if (url.includes('send')) action = 'send';
    if (url.includes('verify')) action = 'verify';

    if (!action || !body.email) {
      return res.status(400).json({ error: "Missing action or email", received: { action, email: body.email } });
    }

    // Verstuur naar Google Apps Script
    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        email: body.email,
        code: body.code || ""
      }),
      redirect: 'follow'
    });

    const result = await gasResponse.json();
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
