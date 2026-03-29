const EMPTY = { assessments: 0, feedback: 0, helpfulRate: 0, byUrgency: {}, byResponse: {} };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  console.log('[impact] UPSTASH_REDIS_REST_URL present:', !!url, url ? url.slice(0, 40) : 'MISSING');
  console.log('[impact] UPSTASH_REDIS_REST_TOKEN present:', !!token);

  if (!url || !token) {
    console.error('[impact] Missing env vars — returning zeros');
    return res.status(200).json(EMPTY);
  }

  // AbortController kills all in-flight fetches if anything hangs
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const opts = { headers, signal: ctrl.signal };

    const [feedbackKeys, assessmentKeys] = await Promise.all([
      scanKeys(url, opts, 'feedback:*'),
      scanKeys(url, opts, 'assessments:*'),
    ]);

    console.log('[impact] feedbackKeys:', feedbackKeys.length, 'assessmentKeys:', assessmentKeys.length);

    let totalAssessments = 0;
    let totalFeedback = 0;
    let helpfulCount = 0;
    const byUrgency = {};
    const byResponse = {};

    if (feedbackKeys.length > 0) {
      const values = await mget(url, opts, feedbackKeys);
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
      const values = await mget(url, opts, assessmentKeys);
      values.forEach(v => { totalAssessments += parseInt(v || 0, 10); });
    }

    clearTimeout(timeout);
    res.status(200).json({
      assessments: totalAssessments,
      feedback: totalFeedback,
      helpfulRate: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
      byUrgency,
      byResponse,
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error('[impact] error:', e.message);
    res.status(200).json(EMPTY);
  }
}

async function scanKeys(baseUrl, opts, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const r = await fetch(
      `${baseUrl}/scan/${cursor}?match=${encodeURIComponent(pattern)}&count=1000`,
      opts
    );
    const data = await r.json();
    cursor = String(data.result?.[0] ?? '0');
    keys.push(...(data.result?.[1] || []));
  } while (cursor !== '0' && keys.length < 10000);
  return keys;
}

async function mget(baseUrl, opts, keys) {
  const r = await fetch(`${baseUrl}/pipeline`, {
    method: 'POST',
    headers: { ...opts.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(keys.map(k => ['GET', k])),
    signal: opts.signal,
  });
  const data = await r.json();
  return data.map(d => d.result);
}
