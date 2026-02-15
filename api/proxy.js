export default async function handler(req, res) {
  // 1. CORS Headers - Laat browsers weten dat deze API toegankelijk is
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Voor maximale compatibiliteit
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // 2. Belangrijk: Reageer direct op de browser check (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // De Google Apps Script URL (Hardcoded voor veiligheid)
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyjjYmri3_TTlcRANHZLR-IghRbslxY2C-T7eJ7UzY2lPr7KN0Sv0HES7gKreT_IRcI/exec";

  try {
    const { email, code } = req.body;
    
    // Bepaal de actie op basis van het URL-pad
    // Bijv: /api/proxy/send of /api/proxy/verify
    let action = "";
    const path = req.url;

    if (path.includes("send")) {
      action = "send";
    } else if (path.includes("verify")) {
      action = "verify";
    } else {
      return res.status(400).json({ error: "Gebruik /send of /verify endpoint" });
    }

    if (!email) {
      return res.status(400).json({ error: "Geen email opgegeven" });
    }

    // Bouw de payload voor Google Apps Script
    const payload = {
      action: action,
      email: email,
      code: code || ""
    };

    // Verstuur naar Google Apps Script
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow' // Cruciaal voor GAS 302 redirects
    });

    const data = await response.json();

    // Stuur resultaat terug naar je frontend
    return res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ 
      error: "Backend Proxy Error", 
      details: error.message 
    });
  }
}
