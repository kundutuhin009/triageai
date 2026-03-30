# 🩺 TriageAI — Rural Health AI Assistant

> Free, AI-powered symptom triage for rural India.
> Built to demonstrate Clinical AI validation gaps.

## 🌍 Live Demo

**[triageai-omega.vercel.app](https://triageai-omega.vercel.app)**

---

## 🎯 Why This Exists

Clinical AI is being deployed in healthcare with no rigorous validation framework. Millions of people in rural India lack access to basic triage — yet AI tools are being built and shipped without the same scrutiny applied to medical devices. This prototype demonstrates both the **potential** of AI-assisted triage AND the **validation gaps** that exist when these systems are deployed without IQ/OQ/PQ frameworks. It is a working proof-of-concept and a call for better standards.

---

## ✨ Features

- 🔴🟡🟢 **AI symptom triage** — Green / Amber / Red urgency levels
- 🎤 **Voice input** in Hindi, Bengali, Kannada, Tamil, English
- 📍 **Geolocation** + nearest hospitals and pharmacies
- 🔍 **Progressive radius search** — 5km → 15km → 30km
- 💬 **WhatsApp doctor summary** — one-tap share
- 📋 **Medical document reader** — prescriptions, clinical notes, lab reports
- 📊 **Anonymous impact dashboard** — live metrics at `/impact`
- 🌐 **Multilingual support** — five Indian languages

---

## 🏗️ System Architecture

```
USER (Mobile/Browser)
        │
        ▼
   Vercel CDN (Static HTML/JS)
        │
        ├─────────────────────┐
        ▼                     ▼
Vercel Serverless         Browser APIs
Functions (/api)          - Geolocation
        │                 - Web Speech API
        ├────────────────────────────────┐
        │                                │
        ▼                                ▼
Anthropic Claude API          OpenStreetMap
- Haiku (triage)              Overpass API
- Sonnet (documents)          (Hospital data)
        │
        ▼
  Upstash Redis
  (Anonymous metrics only)
```

---

## 🧠 AI Layer

| Task | Model | Reason |
|------|-------|--------|
| Symptom triage | Claude Haiku | Fast, cost-optimised, low latency |
| Medical documents | Claude Sonnet | Vision capability required |

Two models are used deliberately — **cost-quality optimisation per task type**. Triage needs speed; document reading needs accuracy and vision. Using Sonnet for everything would be 5× the cost with no benefit for simple triage.

---

## 🔒 Privacy By Design

| Data | Treatment |
|------|-----------|
| Symptoms | Processed by Claude API, then discarded. Never stored. |
| Location | Browser-only geolocation. Never transmitted to any server. |
| Documents | Base64 encoded, sent to Claude, never stored. |
| User identity | No accounts, no sessions, no cookies. |
| Storage | Anonymous counters only (Redis). Zero PII. |

This is a **stateless architecture**. Every request is independent. There is nothing to breach.

---

## 📊 Validation Framework

Applying IQ / OQ / PQ — the medical device validation standard — to an AI system:

| Stage | Status | Description |
|-------|--------|-------------|
| IQ — Installation Qualification | ✅ Complete | Deployed, verified, environment confirmed |
| OQ — Operational Qualification | ✅ Complete | Assessments logged, feedback captured |
| PQ — Performance Qualification | ⚠️ In progress | Needs 1,000+ real-world cases |

**Live metrics:** [triageai-omega.vercel.app/impact](https://triageai-omega.vercel.app/impact)

The `/impact` dashboard tracks triage helpfulness rate and prescription accuracy rate in real time. PQ status is marked ✅ when both exceed 80%.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JS — no framework |
| Deployment | Vercel (serverless functions + CDN) |
| AI | Anthropic Claude API (Haiku + Sonnet) |
| Hospital data | OpenStreetMap Overpass API |
| Metrics | Upstash Redis (REST API) |
| Voice | Web Speech API (browser-native) |

---

## 🌱 Why Vanilla JS?

Rural India uses low-end Android devices on 3G connections. No React bundle overhead. No hydration delay. No service worker complexity on first load.

**The page loads in under 2 seconds on a 3G connection.** Every architectural decision is rural-first. The entire app — including all styles and logic — is a single HTML file under 100KB.

---

## ⚠️ Disclaimer

This is an **educational prototype** exploring Clinical AI validation gaps. It is **NOT a medical device**, NOT a diagnostic tool, and does NOT replace a qualified doctor. The creator accepts no liability for decisions made based on this tool. For emergencies, call **112**.

---

## 🔭 Roadmap

- [ ] Offline PWA mode (service worker, cached responses)
- [ ] Hindi UI language
- [ ] Conversational triage flow
- [ ] Federated learning from anonymised outcomes
- [ ] Clinical validation study with partner hospital

---

## 📝 Part Of

This project is part of a research series on **Clinical AI validation frameworks** — exploring how medical device standards (IQ/OQ/PQ, 21 CFR Part 11) can and should be applied to AI systems in healthcare.

Follow the series: [LinkedIn](https://www.linkedin.com/in/tuhinkundu)

---

Built with ❤️ for rural India.
