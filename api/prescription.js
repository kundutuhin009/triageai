export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pages } = req.body;
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'Missing pages array' });
  }
  if (pages.length > 5) return res.status(400).json({ error: 'Maximum 5 pages allowed' });

  const apiKey        = process.env.ANTHROPIC_API_KEY;
  const visionApiKey  = process.env.GOOGLE_VISION_API_KEY;
  const redisUrl      = process.env.UPSTASH_REDIS_REST_URL;
  const token         = process.env.UPSTASH_REDIS_REST_TOKEN;
  const rHeaders      = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── PRE-READ: fetch top-50 medicine variations for prompt context ────────────
  let variationsCtx = '';
  if (redisUrl && token) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const opts = { headers: rHeaders, signal: ctrl.signal };

      const idxResp  = await fetch(`${redisUrl}/smembers/medicines:index`, opts);
      const idxData  = await idxResp.json();
      const allNames = (idxData.result || []).filter(Boolean);

      if (allNames.length > 0) {
        const countPipeline = allNames.map(n => ['HGET', 'medicine:' + n, 'seen_count']);
        const countResp = await fetch(`${redisUrl}/pipeline`, {
          method: 'POST', headers: rHeaders, signal: ctrl.signal,
          body: JSON.stringify(countPipeline),
        });
        const countData = await countResp.json();

        const ranked = allNames
          .map((name, i) => ({ name, count: parseInt(countData[i]?.result || 0, 10) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50);

        const varPipeline = ranked.map(m => ['HGET', 'medicine:' + m.name, 'variations']);
        const varResp = await fetch(`${redisUrl}/pipeline`, {
          method: 'POST', headers: rHeaders, signal: ctrl.signal,
          body: JSON.stringify(varPipeline),
        });
        const varData = await varResp.json();

        const lines = ranked
          .map((m, i) => {
            const variations = varData[i]?.result || m.name;
            return variations !== m.name ? `${m.name}: ${variations}` : m.name;
          })
          .filter(Boolean);

        if (lines.length > 0) {
          variationsCtx = '\n\nMedicine variations reference (seen in Indian prescriptions):\n'
            + lines.join('\n') + '\n';
        }
      }
    } catch (_) { /* continue without context */ }
  }

  // ── STEP 1: Google Vision OCR (images only) ──────────────────────────────────
  // Only attempt Vision if all pages are images and the API key is configured.
  // PDFs and Vision failures fall back to Claude-with-image (Step 1b below).
  const allImages = pages.every(p => p.mediaType?.startsWith('image/'));
  let visionRawText = null;

  if (allImages && visionApiKey) {
    try {
      const visionTexts = [];
      for (let i = 0; i < pages.length; i++) {
        const { data } = pages[i];
        const vResp = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                image: { content: data },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              }],
            }),
          }
        );
        const vData = await vResp.json();
        const text  = vData.responses?.[0]?.fullTextAnnotation?.text || '';
        if (text) {
          visionTexts.push(pages.length > 1 ? `[Page ${i + 1}]\n${text}` : text);
        }
      }
      if (visionTexts.length === pages.length) {
        // All pages extracted successfully
        visionRawText = visionTexts.join('\n\n');
      }
    } catch (_) {
      visionRawText = null; // fall through to Claude-with-image
    }
  }

  // ── STEP 2: Claude structured parsing ────────────────────────────────────────
  function parseJSON(text) {
    return JSON.parse(text.replace(/```json\n?|```/g, '').trim());
  }

  const claudeHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  const jsonSchema = `{
  "document_type": "prescription" | "clinical_note" | "lab_report" | "discharge_summary" | "unknown",
  "patientDetails": { "name": "", "age": "", "sex": "", "date": "" },
  "doctor": "",
  "clinic": "",
  "diagnosis": "",
  "clinicalNotes": "",
  "medications": [
    { "name": "", "dosage": "", "frequency": "", "instructions": "" }
  ],
  "existingLabResults": [{ "test": "", "value": "" }],
  "labTestsOrdered": [],
  "recommendations": "",
  "followUp": ""
}`;

  let claudeBody;

  if (visionRawText) {
    // ── Path A: Vision succeeded — send text only to Claude ──────────────────
    const systemPrompt = `You are a medical prescription parser. You receive raw OCR text extracted by Google Vision from an Indian handwritten prescription. Your job is to parse it into structured data accurately.`;

    const userPrompt = `This is raw OCR text from a handwritten Indian prescription:
"""
${visionRawText}
"""
${variationsCtx}
Rules:
- Patient name is a continuous Indian name (e.g. "LAXMI BORA", "RAHUL SHARMA") — not initials, no dots between letters
- "contm" or "contin" = "continue"
- "1gm" = 1 gram (NOT 15mg) — medically critical distinction
- Any item starting with "Blood" followed by test names (Sugar, HbA1c, CBC, etc.) is ALWAYS a lab test order — put it in labTestsOrdered, NEVER in medications
- Copy drug names EXACTLY as written — do not substitute with pharmacological equivalents
- If a drug name is unclear, write "[unclear: bestguess?]"
- clinicalNotes = clinical presentation on the left side (symptoms, history, examination findings)
- recommendations = "will benefit from..." or lifestyle/treatment advice
- existingLabResults = test values already written on the document (e.g. "Sugar: 180 mg/dL")
- labTestsOrdered = new tests the doctor is ordering

Return ONLY this JSON, no extra text, no markdown:
${jsonSchema}

If completely unreadable: {"error": "Could not read document"}`;

    claudeBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };
  } else {
    // ── Path B: No Vision (PDF or Vision unavailable) — Claude reads image ───
    const contentBlocks = [];
    for (let i = 0; i < pages.length; i++) {
      const { data, mediaType } = pages[i];
      if (!data || !mediaType) continue;
      if (mediaType.startsWith('image/')) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
      } else if (mediaType === 'application/pdf') {
        contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      }
      if (pages.length > 1) contentBlocks.push({ type: 'text', text: `[End of page ${i + 1}]` });
    }

    const pageLabel = pages.length === 1 ? '1 page' : `${pages.length} pages`;

    const systemPrompt = `You are a precise medical document OCR reader. Extract ONLY what is explicitly written in the image.
- Never substitute drug names with pharmacological equivalents
- Never split continuous handwritten names into initials (e.g. "LAXMI" must not become "L.A.X.M.I")
- Never infer, assume, or add information not visible in the document`;

    const userPrompt = `Carefully read every part of this handwritten prescription. You are reading ${pageLabel}.${variationsCtx}

PATIENT NAME: read as a continuous string left to right — it is an Indian name (e.g. "LAXMI BORA"). Do NOT add dots between letters or treat as initials.

MEDICATIONS:
- Copy drug names EXACTLY as written
- Any item starting with "Blood" followed by test names goes in labTestsOrdered, NEVER medications
- "contm"/"contin" = "continue"
- "1gm" = 1 gram (NOT 15mg)
- If unclear, write "[unclear: bestguess?]"
- Abbreviations: OD=Once daily, BD=Twice daily, TDS/TID=Three times daily, QID=Four times daily, HS=At bedtime, AC=Before food, PC=After food, SOS=When needed

FIELDS:
- clinicalNotes = clinical presentation on the left side of the prescription
- recommendations = "will benefit from..." or lifestyle/treatment advice
- existingLabResults = test values already written on document
- labTestsOrdered = new tests being ordered

Return ONLY this JSON, no extra text, no markdown:
${jsonSchema}

If completely unreadable: {"error": "Could not read document"}`;

    claudeBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: [...contentBlocks, { type: 'text', text: userPrompt }] }],
    };
  }

  let pass1Result;
  try {
    const resp      = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: claudeHeaders, body: JSON.stringify(claudeBody),
    });
    const apiResult = await resp.json();
    const rawText   = apiResult.content?.map(b => b.text || '').join('') || '';

    try {
      pass1Result = parseJSON(rawText);
    } catch (_parseErr) {
      // Retry once: send Claude's malformed output back and ask for clean JSON
      const retryResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: claudeHeaders,
        body: JSON.stringify({
          ...claudeBody,
          messages: [
            ...claudeBody.messages,
            { role: 'assistant', content: rawText },
            { role: 'user', content: 'Return valid JSON only. No extra text, no markdown, no explanation.' },
          ],
        }),
      });
      const retryResult = await retryResp.json();
      const retryText   = retryResult.content?.map(b => b.text || '').join('') || '';
      pass1Result = parseJSON(retryText);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read document', detail: e.message });
  }

  if (pass1Result.error) return res.status(200).json(pass1Result);

  // Attach raw Vision text for UI debug display
  if (visionRawText) pass1Result._visionRawText = visionRawText;

  // ── PASS 2: Resolve unclear medicine names (text-only, Haiku) ────────────────
  const unclearMeds = (pass1Result.medications || []).filter(m => m.name?.startsWith('[unclear'));
  if (unclearMeds.length > 0) {
    const pass2Prompt = `Resolve illegible medicine names from an Indian prescription scan.

Unclear items:
${unclearMeds.map((m, i) => `${i + 1}. Written as: "${m.name}" | Dosage: "${m.dosage || '?'}" | Frequency: "${m.frequency || '?'}"`).join('\n')}

Using your knowledge of Indian prescription medicines (brands and generics), resolve each to the most likely correct name.

Return ONLY a JSON array (no markdown):
[{"original":"as written","resolved":"best guess","confidence":"high|medium|low"}]`;

    try {
      const resp2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: claudeHeaders,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: pass2Prompt }],
        }),
      });
      const r2    = await resp2.json();
      const text2 = r2.content?.map(b => b.text || '').join('') || '';
      const resolutions = JSON.parse(text2.replace(/```json\n?|```/g, '').trim());
      if (Array.isArray(resolutions)) {
        pass1Result.medications = (pass1Result.medications || []).map(m => {
          if (!m.name?.startsWith('[unclear')) return m;
          const fix = resolutions.find(r => r.original === m.name);
          if (fix && fix.confidence !== 'low') {
            return { ...m, name: fix.resolved, _originalName: m.name };
          }
          return m;
        });
      }
    } catch (_) { /* keep Pass 1 results */ }
  }

  // ── POST-READ: update medicine HASHes (fire-and-forget) ─────────────────────
  if (redisUrl && token) {
    (async () => {
      try {
        const date = new Date().toISOString().slice(0, 10);

        const medicines = (pass1Result.medications || [])
          .map(m => ({
            canonical: m.name,
            variation: m._originalName || m.name,
          }))
          .filter(m => m.canonical && m.canonical !== 'Not mentioned'
                    && !m.canonical.startsWith('[unclear')
                    && m.canonical.length > 1 && m.canonical.length < 60);

        if (medicines.length === 0) {
          await fetch(`${redisUrl}/pipeline`, {
            method: 'POST', headers: rHeaders,
            body: JSON.stringify([['INCR', 'docs_scanned:' + date.replace(/-/g, '')]]),
          });
          return;
        }

        const scardResp = await fetch(`${redisUrl}/scard/medicines:index`, { headers: rHeaders });
        const scardData = await scardResp.json();
        const currentTotal = scardData.result || 0;

        const isMemPipeline = medicines.map(m => ['SISMEMBER', 'medicines:index', m.canonical]);
        const isMemResp = await fetch(`${redisUrl}/pipeline`, {
          method: 'POST', headers: rHeaders,
          body: JSON.stringify(isMemPipeline),
        });
        const isMemData = await isMemResp.json();

        const pipeline = [['INCR', 'docs_scanned:' + date.replace(/-/g, '')]];
        let newCount = 0;

        for (let i = 0; i < medicines.length; i++) {
          const { canonical, variation } = medicines[i];
          const exists = isMemData[i]?.result === 1;

          if (exists) {
            pipeline.push(['HINCRBY', 'medicine:' + canonical, 'seen_count', '1']);
            pipeline.push(['HSET',    'medicine:' + canonical, 'last_seen', date]);
            if (variation !== canonical) {
              pipeline.push(['HGET', 'medicine:' + canonical, 'variations']); // placeholder
            }
          } else if (currentTotal + newCount < 500) {
            pipeline.push(['SADD', 'medicines:index', canonical]);
            pipeline.push(['HSET', 'medicine:' + canonical,
              'canonical',  canonical,
              'variations', variation,
              'seen_count', '1',
              'last_seen',  date,
            ]);
            newCount++;
          }
        }

        await fetch(`${redisUrl}/pipeline`, {
          method: 'POST', headers: rHeaders,
          body: JSON.stringify(pipeline.filter(cmd => cmd[0] !== 'HGET')),
        });

        const existingWithVariations = medicines.filter((m, i) =>
          isMemData[i]?.result === 1 && m.variation !== m.canonical
        );
        if (existingWithVariations.length > 0) {
          const getVarPipeline = existingWithVariations.map(m => ['HGET', 'medicine:' + m.canonical, 'variations']);
          const getVarResp = await fetch(`${redisUrl}/pipeline`, {
            method: 'POST', headers: rHeaders,
            body: JSON.stringify(getVarPipeline),
          });
          const getVarData = await getVarResp.json();

          const setVarPipeline = existingWithVariations
            .map((m, i) => {
              const existing = getVarData[i]?.result || m.canonical;
              const parts = existing.split('|').map(s => s.trim());
              if (parts.includes(m.variation)) return null;
              return ['HSET', 'medicine:' + m.canonical, 'variations', existing + '|' + m.variation];
            })
            .filter(Boolean);

          if (setVarPipeline.length > 0) {
            await fetch(`${redisUrl}/pipeline`, {
              method: 'POST', headers: rHeaders,
              body: JSON.stringify(setVarPipeline),
            });
          }
        }
      } catch (_) { /* fire-and-forget */ }
    })();
  }

  return res.status(200).json(pass1Result);
}
