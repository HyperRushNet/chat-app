/*
 * HyperRush Network - GH: HyperRushNet
 * MIT License - 2026
 * api/mailAPI.js
 * 
 * Environment Variables needed in Vercel:
 * - FRONTEND_URL: Your site domain (e.g. https://hrn.chat). Leave empty for '*' (public).
 * - GAS_URL: (Optional) Google Apps Script Web App URL.
 */

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const GAS_URL = process.env.GAS_URL || 
    "https://script.google.com/macros/s/AKfycbyjjYmri3_TTlcRANHZLR-IghRbslxY2C-T7eJ7UzY2lPr7KN0Sv0HES7gKreT_IRcI/exec";

  try {
    const { email, code = "", action } = req.body;

    if (!email || typeof email !== 'string') return res.status(400).json({ error: "Email required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email" });
    if (!action || !['send', 'verify'].includes(action)) return res.status(400).json({ error: "Invalid action" });

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, code })
    });

    const result = await response.json();
    return res.status(200).json(result);

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
