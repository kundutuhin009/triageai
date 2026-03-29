export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(200).json({
      assessments: 0,
      feedback: 0,
      helpfulRate: 0,
      byUrgency: {},
    });
  }

  const headers = { Authorization: `Bearer ${kvToken}` };

  const [feedbackKeys, assessmentKeys] = await Promise.all([
    scanKeys(kvUrl, headers, 'feedback:*'),
    scanKeys(kvUrl, headers, 'assessments:*'),
  ]);

  let totalAssessments = 0;
  let totalFeedback = 0;
  let helpfulCount = 0;
  const byUrgency = {};
  const byResponse = {};

  if (feedbackKeys.length > 0) {
    const pipeline = feedbackKeys.map(k => ['GET', k]);
    const pipeResp = await fetch(`${kvUrl}/pipeline`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
    });
    const pipeData = await pipeResp.json();

    feedbackKeys.forEach((key, i) => {
      const val = parseInt(pipeData[i]?.result || 0, 10);
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
    const pipeline = assessmentKeys.map(k => ['GET', k]);
    const pipeResp = await fetch(`${kvUrl}/pipeline`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
    });
    const pipeData = await pipeResp.json();
    pipeData.forEach(d => {
      totalAssessments += parseInt(d?.result || 0, 10);
    });
  }

  res.status(200).json({
    assessments: totalAssessments,
    feedback: totalFeedback,
    helpfulRate: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
    byUrgency,
    byResponse,
  });
}

async function scanKeys(baseUrl, headers, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const resp = await fetch(
      `${baseUrl}/scan/${cursor}?match=${encodeURIComponent(pattern)}&count=1000`,
      { headers }
    );
    const data = await resp.json();
    cursor = data.result?.[0] || '0';
    const batch = data.result?.[1] || [];
    keys.push(...batch);
  } while (cursor !== '0' && keys.length < 10000);
  return keys;
}
