export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pages } = req.body;
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'Missing pages array' });
  }
  if (pages.length > 5) return res.status(400).json({ error: 'Maximum 5 pages allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisHeaders = { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' };

  // Fetch learned medicines for context (best-effort, 3s timeout)
  let learnedMedicines = [];
  if (redisUrl && redisToken) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${redisUrl}/smembers/medicines:learned`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: ctrl.signal,
      });
      const d = await r.json();
      learnedMedicines = (d.result || []).slice(0, 100);
    } catch (_) {}
  }

  // Build content blocks for all pages
  const contentBlocks = [];
  for (let i = 0; i < pages.length; i++) {
    const { data, mediaType } = pages[i];
    if (!data || !mediaType) continue;
    if (mediaType.startsWith('image/')) {
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
    } else if (mediaType === 'application/pdf') {
      contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
    }
    if (pages.length > 1) {
      contentBlocks.push({ type: 'text', text: `[End of page ${i + 1}]` });
    }
  }

  const learnedCtx = learnedMedicines.length > 0
    ? `\nPreviously seen medicines in this app (use as reference if helpful): ${learnedMedicines.join(', ')}\n`
    : '';

  const pageLabel = pages.length === 1 ? '1 page' : `${pages.length} pages`;

  // ── PASS 1: Full document read ──────────────────────────────────────────────
  const pass1Prompt = `You are an expert medical document interpreter specialising in Indian healthcare. You are reading ${pageLabel} of a medical document.${learnedCtx}

Step 1 — Identify document type: prescription, clinical_note, lab_report, discharge_summary, or unknown.
Step 2 — Extract ALL visible text from ALL pages. Cross-reference with common Indian brands for unclear items.

Abbreviations: OD=Once daily, BD=Twice daily, TDS/TID=Three times daily, QID=Four times daily, HS=At bedtime, AC=Before food, PC=After food, SOS=When needed, Stat=Immediately, x5/7=5 days, x1/52=1 week, x1/12=1 month.

Common Indian medicine reference: Crocin, Dolo, Pan, Augmentin, Azithral, Metformin, Glycomet, Telma, Ecosprin, Shelcal, Combiflam, Allegra, Montair, Omez, Pantop, Taxim, Zifi, Mox, Cifran, Amoxyclav, Atorva, Telmisartan, Cetrizine, Sinarest, Wikoryl, Zerodol, Aciloc, Ranitidine, Sorbitrate.

For unclear/illegible items: give your best guess and mark unclear:true. NEVER leave name empty.

Respond ONLY in this exact JSON (no markdown, no explanation):
{
  "document_type": "prescription" | "clinical_note" | "lab_report" | "discharge_summary" | "unknown",
  "medicines": [
    {
      "name": "Brand name as written",
      "generic": "Generic/chemical name",
      "dosage": "e.g. 500mg",
      "frequency": "Plain English decoded from abbreviation",
      "duration": "e.g. 5 days or Not mentioned",
      "purpose": "What this medicine treats",
      "warnings": "Key warnings or Not mentioned",
      "unclear": true or false
    }
  ],
  "clinical": {
    "patient": "Name/age/gender if visible or Not mentioned",
    "chief_complaint": "Main complaint",
    "examination": "Examination findings",
    "diagnosis": "Diagnosis or differential",
    "tests_recommended": ["test 1", "test 2"],
    "plan": "Treatment plan"
  },
  "lab_tests": [
    {
      "name": "Test name",
      "result": "Result with unit",
      "normal_range": "Normal range or Not mentioned",
      "abnormal": true or false,
      "meaning": "Plain English explanation"
    }
  ],
  "discharge": {
    "admission_date": "Date or Not mentioned",
    "discharge_date": "Date or Not mentioned",
    "diagnosis": "Final diagnosis",
    "treatment_summary": "Treatment received during admission",
    "discharge_medicines": "Medicines prescribed on discharge",
    "follow_up": "Follow-up instructions"
  },
  "doctor_notes": "General instructions or Not mentioned",
  "follow_up": "Follow-up or Not mentioned"
}

Rules:
- Populate ONLY the section matching document_type; leave others as [] or null.
- Always append to doctor_notes: "⚠️ Please verify with your doctor or pharmacist before acting on this."
- If completely unreadable: {"error": "Could not read document"}`;

  let pass1Result;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: [...contentBlocks, { type: 'text', text: pass1Prompt }] }],
      }),
    });
    const apiResult = await resp.json();
    const text = apiResult.content?.map(b => b.text || '').join('') || '';
    pass1Result = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read document', detail: e.message });
  }

  if (pass1Result.error) return res.status(200).json(pass1Result);

  // ── PASS 2: Resolve unclear medicine names (text-only, Haiku) ──────────────
  const unclearMeds = (pass1Result.medicines || []).filter(m => m.unclear);
  if (unclearMeds.length > 0) {
    const pass2Prompt = `Resolve illegible medicine names from an Indian prescription scan.

Unclear items:
${unclearMeds.map((m, i) => `${i + 1}. Written as: "${m.name}" | Dosage: "${m.dosage || '?'}" | Frequency: "${m.frequency || '?'}" | Purpose: "${m.purpose || '?'}"`).join('\n')}

Using your knowledge of Indian prescription medicines (brands and generics), resolve each to the most likely correct name.

Return ONLY a JSON array (no markdown):
[{"original":"as written","resolved":"best guess","generic":"generic name","confidence":"high|medium|low"}]`;

    try {
      const resp2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: pass2Prompt }],
        }),
      });
      const r2 = await resp2.json();
      const text2 = r2.content?.map(b => b.text || '').join('') || '';
      const resolutions = JSON.parse(text2.replace(/```json\n?|```/g, '').trim());
      if (Array.isArray(resolutions)) {
        pass1Result.medicines = (pass1Result.medicines || []).map(m => {
          if (!m.unclear) return m;
          const fix = resolutions.find(r => r.original === m.name);
          if (fix && fix.confidence !== 'low') {
            return { ...m, name: fix.resolved, generic: fix.generic || m.generic, unclear: false };
          }
          return m;
        });
      }
    } catch (_) {
      // Pass 2 failed — keep Pass 1 results as-is
    }
  }

  // ── Fire-and-forget: store medicine names + increment docs counter ─────────
  if (redisUrl && redisToken) {
    const medicineNames = (pass1Result.medicines || [])
      .map(m => m.name)
      .filter(n => n && n !== 'Not mentioned' && n.length > 1 && n.length < 60);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pipeline = [['INCR', 'docs_scanned:' + date]];
    if (medicineNames.length > 0) {
      pipeline.push(['SADD', 'medicines:learned', ...medicineNames]);
      // Trim to max 500 (best-effort via SCARD check not needed — Redis SET deduplicates)
    }
    fetch(`${redisUrl}/pipeline`, {
      method: 'POST',
      headers: redisHeaders,
      body: JSON.stringify(pipeline),
    }).catch(() => {});
  }

  return res.status(200).json(pass1Result);
}
