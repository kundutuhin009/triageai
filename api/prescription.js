export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, mediaType } = req.body;
  if (!data || !mediaType) {
    return res.status(400).json({ error: 'Missing data or mediaType' });
  }

  const isImage = mediaType.startsWith('image/');
  const isPdf = mediaType === 'application/pdf';

  if (!isImage && !isPdf) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  const contentBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };

  const prompt = `You are a pharmacist assistant helping patients in rural India understand their prescriptions.

Carefully read this prescription and extract every medicine listed.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "medicines": [
    {
      "name": "Medicine name in clear readable text",
      "dosage": "e.g. 500mg, 10ml",
      "frequency": "e.g. Twice daily, Every 8 hours, Once at night",
      "duration": "e.g. 5 days, 1 week, or blank if not specified",
      "purpose": "Plain English explanation of what this medicine is for, in 1 sentence",
      "warnings": "Key warnings e.g. Take after food, Avoid alcohol, May cause drowsiness — or blank if none"
    }
  ],
  "doctor_notes": "Any general instructions or notes from the doctor, or blank if none",
  "follow_up": "Follow-up instructions if any, or blank if none"
}

If you cannot read the prescription clearly, still return the JSON with what you can read and note "[unclear]" where text is illegible.
If this image is not a prescription, return: {"error": "Not a prescription"}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
    }),
  });

  const result = await response.json();
  res.status(response.status).json(result);
}
