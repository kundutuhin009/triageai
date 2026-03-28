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

  const prompt = `You are a medical prescription interpreter specialising in Indian prescriptions and handwriting.

When reading this prescription:
1. First identify ALL text visible, even partial.
2. For unclear words — give your best guess AND flag it with ⚠️ Unclear.
3. Cross-reference with common Indian brand names: Crocin, Dolo, Pan, Augmentin, Azithral, Metformin, Glycomet, Telma, Ecosprin, Shelcal, Combiflam, Allegra, Montair, Omez, Pantop, Taxim, Zifi, Mox, Cifran.
4. Decode common abbreviations:
   OD = Once daily, BD = Twice daily, TDS/TID = Three times daily, QID = Four times daily,
   HS = At bedtime, AC = Before food, PC = After food, SOS = When needed, Stat = Immediately,
   x 5/7 = for 5 days, x 1/52 = for 1 week, x 1/12 = for 1 month.
5. For EVERY medicine provide: brand name as written, generic name, dosage, frequency in plain English, purpose, and flag with ⚠️ if uncertain.
6. If you cannot read something at all — write "Could not read — please ask your doctor or pharmacist" rather than guessing.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "medicines": [
    {
      "name": "Brand name as written on prescription",
      "generic": "Generic/chemical name of the drug",
      "dosage": "e.g. 500mg, 10ml",
      "frequency": "Plain English e.g. Twice daily after food — decoded from abbreviation",
      "duration": "e.g. 5 days, 1 week, or blank if not specified",
      "purpose": "Plain English explanation of what this medicine treats, in 1 sentence",
      "warnings": "Key warnings e.g. Take after food, Avoid alcohol, May cause drowsiness — or blank if none",
      "unclear": true or false
    }
  ],
  "doctor_notes": "Any general instructions or notes from the doctor, or blank if none",
  "follow_up": "Follow-up instructions if any, or blank if none"
}

IMPORTANT — handling unclear text:
If you cannot read a word clearly, do NOT skip it. Instead:
1. Look at the letters you CAN see
2. Cross-reference with common Indian drug names
3. Give your best guess and set "unclear": true to flag it with ⚠️ Uncertain
4. Never return empty fields — always provide a best-effort value

If this image is not a prescription, return: {"error": "Not a prescription"}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
    }),
  });

  const result = await response.json();
  res.status(response.status).json(result);
}
