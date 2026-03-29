import { Redis } from '@upstash/redis';

const EMPTY = { assessments: 0, feedback: 0, helpfulRate: 0, byUrgency: {}, byResponse: {} };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  console.log('[impact] UPSTASH_REDIS_REST_URL set:', !!url, url ? `(${url.slice(0, 30)}...)` : 'MISSING');
  console.log('[impact] UPSTASH_REDIS_REST_TOKEN set:', !!token);

  if (!url || !token) {
    console.error('[impact] Missing Upstash env vars — returning zeros');
    return res.status(200).json(EMPTY);
  }

  const redis = new Redis({ url, token });

  // Hard 8-second timeout so the page never hangs
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis timeout after 8s')), 8000)
  );

  try {
    const result = await Promise.race([fetchStats(redis), timeout]);
    res.status(200).json(result);
  } catch (e) {
    console.error('[impact] Redis error:', e.message);
    res.status(200).json(EMPTY);
  }
}

async function fetchStats(redis) {
  const [feedbackKeys, assessmentKeys] = await Promise.all([
    scanKeys(redis, 'feedback:*'),
    scanKeys(redis, 'assessments:*'),
  ]);

  console.log('[impact] feedbackKeys:', feedbackKeys.length, 'assessmentKeys:', assessmentKeys.length);

  let totalAssessments = 0;
  let totalFeedback = 0;
  let helpfulCount = 0;
  const byUrgency = {};
  const byResponse = {};

  if (feedbackKeys.length > 0) {
    const values = await redis.mget(...feedbackKeys);
    feedbackKeys.forEach((key, i) => {
      const val = parseInt(values[i] || 0, 10);
      if (!val) return;
      const parts = key.split(':');
      const urgency = parts[1];
      const response = parts[2];
      totalFeedback += val;
      if (['helpful', 'hospital', 'home'].includes(response)) helpfulCount += val;
      if (!byUrgency[urgency]) byUrgency[urgency] = { total: 0, helpful: 0 };
      byUrgency[urgency].total += val;
      if (['helpful', 'hospital', 'home'].includes(response)) byUrgency[urgency].helpful += val;
      byResponse[response] = (byResponse[response] || 0) + val;
    });
  }

  if (assessmentKeys.length > 0) {
    const values = await redis.mget(...assessmentKeys);
    values.forEach(v => { totalAssessments += parseInt(v || 0, 10); });
  }

  return {
    assessments: totalAssessments,
    feedback: totalFeedback,
    helpfulRate: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
    byUrgency,
    byResponse,
  };
}

async function scanKeys(redis, pattern) {
  const keys = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 1000 });
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== 0 && keys.length < 10000);
  return keys;
}
