export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  // De hardcoded Google Apps Script URL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyjjYmri3_TTlcRANHZLR-IghRbslxY2C-T7eJ7UzY2lPr7KN0Sv0HES7gKreT_IRcI/exec";

  try {
    const { action, email, code } = req.body;

    // Payload opbouwen voor Google Apps Script
    // We mappen de inkomende requests naar de 'action' die je GAS verwacht
    let payload = { email };

    if (req.url.includes('/sendcode')) {
      payload.action = "send";
    } else if (req.url.includes('/checkcode')) {
      payload.action = "verify";
      payload.code = code;
    } else {
      // Fallback als je de proxy gewoon direct aanroept met een actie in de body
      payload.action = action;
      payload.code = code;
    }

    if (!payload.email || !payload.action) {
      return res.status(400).json({ error: "Missing email or action" });
    }

    // Verstuur naar Google Apps Script
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow' // Cruciaal voor Google Scripts!
    });

    const result = await response.json();
    
    // Check of de verificatie daadwerkelijk succesvol was in de GAS logica
    if (result.message === "Invalid code" || result.message === "Invalid request") {
        return res.status(400).json(result);
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
}
