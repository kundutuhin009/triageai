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

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([['INCR', key]]),
      });
    } catch (e) {
      // fire-and-forget, don't fail the request
    }
  }

  res.status(200).json({ ok: true });
}
