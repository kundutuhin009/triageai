import { Redis } from '@upstash/redis';

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

  console.log('[feedback] UPSTASH_REDIS_REST_URL set:', !!url);
  console.log('[feedback] UPSTASH_REDIS_REST_TOKEN set:', !!token);

  if (!url || !token) {
    console.error('[feedback] Missing Upstash env vars — skipping save');
    return res.status(200).json({ ok: true, saved: false });
  }

  const redis = new Redis({ url, token });
  const date = new Date().toISOString().split('T')[0];
  const key = `feedback:${urgency}:${response}:${date}`;

  try {
    const newCount = await redis.incr(key);
    console.log('[feedback] Saved:', key, '→', newCount);
    res.status(200).json({ ok: true, saved: true, count: newCount });
  } catch (e) {
    console.error('[feedback] Redis error:', e.message);
    res.status(200).json({ ok: true, saved: false, error: e.message });
  }
}
