import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urgency, response } = req.body;
  if (!urgency || !response) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const date = new Date().toISOString().split('T')[0];
  const key = `feedback:${urgency}:${response}:${date}`;

  try {
    await redis.incr(key);
  } catch (e) {
    console.error('Redis error:', e);
  }

  res.status(200).json({ ok: true });
}
