export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No target URL provided" });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { ...req.headers, host: undefined },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    const text = await response.text(); 
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    return res.status(response.status).send(text);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
