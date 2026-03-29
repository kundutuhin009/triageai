import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [feedbackKeys, assessmentKeys] = await Promise.all([
      scanKeys('feedback:*'),
      scanKeys('assessments:*'),
    ]);

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

        // key = feedback:{urgency}:{response}:{date}
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
      values.forEach(v => {
        totalAssessments += parseInt(v || 0, 10);
      });
    }

    res.status(200).json({
      assessments: totalAssessments,
      feedback: totalFeedback,
      helpfulRate: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
      byUrgency,
      byResponse,
    });
  } catch (e) {
    console.error('Redis error:', e);
    res.status(200).json({ assessments: 0, feedback: 0, helpfulRate: 0, byUrgency: {}, byResponse: {} });
  }
}

async function scanKeys(pattern) {
  const keys = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 1000 });
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== 0 && keys.length < 10000);
  return keys;
}
