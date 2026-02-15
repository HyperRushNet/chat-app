export default async function handler(req, res) {
  // 1. Uitgebreide CORS configuratie
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Voor productie kun je dit beperken tot je eigen domein
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyjjYmri3_TTlcRANHZLR-IghRbslxY2C-T7eJ7UzY2lPr7KN0Sv0HES7gKreT_IRcI/exec";

  try {
    const { email, code } = req.body;
    const urlPath = req.url; // Kijk naar de URL om de actie te bepalen

    let action = "";
    if (urlPath.includes("send")) {
      action = "send";
    } else if (urlPath.includes("verify")) {
      action = "verify";
    } else {
      return res.status(400).json({ error: "Gebruik /api/proxy/send of /api/proxy/verify" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is verplicht" });
    }

    // Payload voorbereiden voor GAS
    const payload = {
      action: action,
      email: email,
      code: code || ""
    };

    // 2. Fetch naar Google Apps Script met redirect handling
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow' 
    });

    const data = await response.json();

    // 3. Antwoord terugsturen naar de frontend
    return res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: "Serverfout in de proxy", details: error.message });
  }
}
