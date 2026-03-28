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

  const prompt = `You are a medical document interpreter. Read ANY handwritten or typed medical document and organize it into clean, readable sections.

STEP 1 — Identify the document type: prescription, clinical_note, or lab_report.

STEP 2 — Extract all visible text. For unclear words:
- Look at the letters you CAN see
- Cross-reference with common Indian drug names: Crocin, Dolo, Pan, Augmentin, Azithral, Metformin, Glycomet, Telma, Ecosprin, Shelcal, Combiflam, Allegra, Montair, Omez, Pantop, Taxim, Zifi, Mox, Cifran
- Decode abbreviations: OD=Once daily, BD=Twice daily, TDS/TID=Three times daily, QID=Four times daily, HS=At bedtime, AC=Before food, PC=After food, SOS=When needed, Stat=Immediately, x5/7=5 days, x1/52=1 week, x1/12=1 month
- Give your best guess and mark unclear:true — NEVER leave fields empty, use "Not mentioned" if truly absent

STEP 3 — Respond ONLY in this exact JSON format (no markdown):
{
  "document_type": "prescription" | "clinical_note" | "lab_report",
  "medicines": [
    {
      "name": "Brand name as written",
      "generic": "Generic/chemical name",
      "dosage": "e.g. 500mg",
      "frequency": "Plain English decoded from abbreviation",
      "duration": "e.g. 5 days or Not mentioned",
      "purpose": "What this medicine treats in plain English",
      "warnings": "Key warnings or Not mentioned",
      "unclear": true or false
    }
  ],
  "clinical": {
    "patient": "Name, age, gender if visible or Not mentioned",
    "chief_complaint": "Main reason for visit",
    "examination": "Examination findings",
    "diagnosis": "Diagnosis or differential diagnosis",
    "tests_recommended": ["test 1", "test 2"],
    "plan": "Doctor's treatment plan"
  },
  "lab_tests": [
    {
      "name": "Test name",
      "result": "Patient's result with unit",
      "normal_range": "Normal range or Not mentioned",
      "abnormal": true or false,
      "meaning": "What this result means in plain English"
    }
  ],
  "doctor_notes": "General instructions or Not mentioned",
  "follow_up": "Follow-up instructions or Not mentioned"
}

Rules:
- For prescriptions: populate medicines[], leave clinical and lab_tests empty
- For clinical notes: populate clinical{}, leave medicines and lab_tests empty
- For lab reports: populate lab_tests[], leave medicines and clinical empty
- Always end doctor_notes with: "⚠️ Please verify with your doctor or pharmacist before acting on this."
- If document is unreadable or not medical: return {"error": "Could not read document"}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
    }),
  });

  const result = await response.json();
  res.status(response.status).json(result);
}
