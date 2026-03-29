export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urgency, response } = req.body;
  if (!urgency || !response) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  console.log('[feedback] env vars present:', !!url, !!token);

  if (!url || !token) {
    console.error('[feedback] Missing Upstash env vars');
    return res.status(200).json({ ok: true, saved: false, reason: 'no-env' });
  }

  const date = new Date().toISOString().split('T')[0];
  const key = `feedback:${urgency}:${response}:${date}`;

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);

    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key]]),
      signal: ctrl.signal,
    });
    const data = await r.json();
    const count = data[0]?.result;
    console.log('[feedback] saved:', key, '→', count);
    res.status(200).json({ ok: true, saved: true, count });
  } catch (e) {
    console.error('[feedback] error:', e.message);
    res.status(200).json({ ok: true, saved: false, error: e.message });
  }
}
