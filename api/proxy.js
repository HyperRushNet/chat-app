export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No target URL provided" });

    // Zorg dat de body een string is voor de fetch naar Google
    const bodyToSend = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: req.method === 'POST' ? bodyToSend : undefined,
      redirect: 'follow' // CRUCIAAL: Google Apps Script redirect naar een andere URL
    });

    const text = await response.text();
    
    try {
      const jsonData = JSON.parse(text);
      return res.status(response.status).json(jsonData);
    } catch (e) {
      return res.status(response.status).send(text);
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
