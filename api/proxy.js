export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No target URL provided" });
    const bodyToSend = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: req.method === 'POST' ? bodyToSend : undefined,
      redirect: 'follow'
    });
    const text = await response.text();
    if (!text || text.trim() === "") {
      return res.status(404).json({ error: "No content returned from target URL" });
    }
    try {
      const jsonData = JSON.parse(text);
      return res.status(200).json(jsonData);
    } catch (e) {
      return res.status(200).send(text);
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
