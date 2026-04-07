/**
 * Emo Buddy — Research Embedding Script
 *
 * Runs ONCE locally to embed mental health research papers into Pinecone.
 * Run with:
 *   node --env-file=.env.local scripts/embed-papers.js
 *
 * Prerequisites:
 *   - Pinecone index created (see README below)
 *   - PINECONE_API_KEY, PINECONE_INDEX_NAME, OPENAI_API_KEY in .env.local
 *
 * Pinecone index settings:
 *   Name:       emo-buddy-research  (or whatever PINECONE_INDEX_NAME is set to)
 *   Dimensions: 1024
 *   Metric:     cosine
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const index = pc.index(process.env.PINECONE_INDEX_NAME);

async function embed(text) {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1024,
  });
  return resp.data[0].embedding;
}

const papers = [
  {
    id: 'cbt-basics',
    title: 'Cognitive Behavioral Therapy Core Principles',
    source: 'PubMed Central Open Access',
    content: `
      CBT is based on the concept that thoughts, feelings, and behaviors
      are interconnected. Negative thoughts can trap people in a vicious
      cycle. CBT aims to help people deal with overwhelming problems in a
      more positive way by breaking them into smaller parts.

      Core techniques:
      - Thought records: identifying and challenging negative automatic thoughts
      - Behavioral activation: scheduling positive activities to improve mood
      - Cognitive restructuring: replacing unhelpful thoughts with balanced ones
      - Graded exposure: gradually facing feared situations
      - Problem solving: structured approach to dealing with difficulties

      Evidence: CBT has strong evidence for depression, anxiety, PTSD, OCD.
      Meta-analyses show 50-60% response rates for depression.
    `.trim()
  },
  {
    id: 'act-therapy',
    title: 'Acceptance and Commitment Therapy',
    source: 'PsyArXiv Open Access',
    content: `
      ACT is a form of psychotherapy that uses acceptance and mindfulness
      strategies mixed with commitment and behavior change strategies.

      Six core processes:
      1. Acceptance: allowing thoughts/feelings without fighting them
      2. Cognitive defusion: seeing thoughts as just thoughts, not facts
      3. Being present: mindful awareness of current moment
      4. Self as context: observing self without attachment to narratives
      5. Values: identifying what truly matters
      6. Committed action: taking steps aligned with values

      Key principle: psychological flexibility — the ability to contact
      the present moment fully, and change or persist in behavior in
      service of chosen values.

      For low mood: instead of fighting the feeling, ask
      'What would I do right now if this feeling wasn't stopping me?'
    `.trim()
  },
  {
    id: 'mbct-mindfulness',
    title: 'Mindfulness-Based Cognitive Therapy',
    source: 'PubMed Central Open Access',
    content: `
      MBCT combines cognitive therapy with mindfulness strategies.
      Originally developed for recurrent depression.

      Core mindfulness practices:
      - Body scan: systematic attention to physical sensations
      - Mindful breathing: anchor attention to breath
      - 3-minute breathing space: pause, observe, breathe
      - Mindful movement: gentle awareness during activity

      For rumination (repetitive negative thinking):
      - Notice when mind wanders to past or future
      - Gently return attention to present moment
      - Treat thoughts as mental events, not facts

      Research: reduces relapse in recurrent depression by 43%.
      Particularly effective for people with 3+ depressive episodes.
    `.trim()
  },
  {
    id: 'habit-loop',
    title: 'Habit Formation and Behavior Change',
    source: 'PubMed Central Open Access',
    content: `
      Habits follow a neurological loop: Cue → Routine → Reward

      To break a bad habit:
      1. Identify the cue (time, place, emotional state, people, preceding action)
      2. Identify the reward (what craving does the habit satisfy?)
      3. Keep the cue and reward, change only the routine

      Tiny Habits method (BJ Fogg):
      - Make the new behavior tiny (2 minutes or less)
      - Anchor it to an existing habit
      - Celebrate immediately after

      Common bad habit triggers in young Indians:
      - Academic/job stress → screen time, junk food
      - Loneliness → social media, gaming
      - Family conflict → emotional eating, substance use

      Self-compassion is critical — shame and guilt make habits worse,
      not better. Research shows self-compassion predicts better
      habit change outcomes than willpower.
    `.trim()
  },
  {
    id: 'grounding-techniques',
    title: 'Grounding Techniques for Anxiety and Dissociation',
    source: 'PubMed Central Open Access',
    content: `
      Grounding techniques bring attention back to the present moment.
      Particularly effective for anxiety, panic, dissociation, trauma responses.

      5-4-3-2-1 Technique:
      Name 5 things you can see
      Name 4 things you can touch
      Name 3 things you can hear
      Name 2 things you can smell
      Name 1 thing you can taste

      Box breathing (used by Navy SEALs for stress):
      Inhale for 4 counts
      Hold for 4 counts
      Exhale for 4 counts
      Hold for 4 counts
      Repeat 4 times

      4-7-8 breathing for sleep and anxiety:
      Inhale through nose for 4 counts
      Hold for 7 counts
      Exhale through mouth for 8 counts

      Cold water grounding: splash cold water on face or hold ice —
      activates the dive reflex, slows heart rate within 30 seconds.

      Physical grounding: press feet into floor, feel the chair beneath you,
      squeeze a stress ball.
    `.trim()
  },
  {
    id: 'india-mental-health',
    title: 'Mental Health in India — Context and Barriers',
    source: 'NIMHANS / Lancet India Open Access',
    content: `
      India mental health statistics:
      - 150 million Indians need mental health care (NIMHANS 2023)
      - Only 0.3 psychiatrists per 100,000 people
      - Treatment gap: 80-85% of people with mental illness get no treatment

      Common barriers in India:
      - Stigma: mental illness seen as weakness or spiritual failing
      - Family pressure: 'log kya kahenge' (what will people say)
      - Cost: private therapy ₹1500-5000 per session
      - Awareness: symptoms often not recognized as mental health issues

      Free resources in India:
      - iCall (TISS): 9152987821 — trained counsellors, free
      - Vandrevala Foundation: 1860-2662-345 — 24/7 free
      - NIMHANS helpline: 080-46110007
      - University counselling centres — free for students

      Cultural considerations:
      - Collectivist culture — family involvement both helps and hinders
      - Academic pressure peaks: Class 10, 12, competitive exams
      - Marriage pressure: particularly for women 25-30
      - Financial stress: job market, family responsibilities
      - Festivals and loneliness: paradox of crowded festivals feeling isolating

      Protective factors in Indian context:
      - Strong family bonds (when healthy)
      - Spirituality and faith communities
      - Tight social networks
      - Resilience culture
    `.trim()
  },
  {
    id: 'crisis-intervention',
    title: 'Crisis Intervention and Safe Messaging Guidelines',
    source: 'WHO Mental Health Guidelines Open Access',
    content: `
      WHO safe messaging guidelines for suicide:
      - Never provide detailed methods
      - Always provide crisis resources
      - Use language: 'died by suicide' not 'committed suicide'
      - Focus on help-seeking, recovery stories
      - Express care and concern directly

      Warning signs to take seriously:
      - Talking about wanting to die or to kill themselves
      - Looking for ways to kill themselves
      - Talking about being a burden to others
      - Increased substance use
      - Withdrawing from friends and family
      - Giving away prized possessions
      - Saying goodbyes

      Protective factors:
      - Reasons for living (family, pets, future plans)
      - Access to mental health care
      - Strong social support
      - Problem-solving skills
      - Religious or cultural beliefs against suicide

      How to talk to someone in crisis:
      - Ask directly: 'Are you thinking about suicide?' — asking does NOT
        increase risk, research shows it reduces it
      - Listen without judgment
      - Don't promise secrecy
      - Help them connect to professional support
      - Stay with them or ensure someone else does

      Indian crisis numbers:
      iCall: 9152987821
      Vandrevala: 1860-2662-345
      AASRA: 9820466627
      Snehi: 044-24640050
    `.trim()
  },
  {
    id: 'self-compassion',
    title: 'Self-Compassion and Mental Wellbeing',
    source: 'PsyArXiv Open Access — Kristin Neff research',
    content: `
      Self-compassion has three components (Kristin Neff):
      1. Self-kindness: treating yourself with warmth vs harsh judgment
      2. Common humanity: recognizing suffering is part of shared human experience
      3. Mindfulness: holding painful thoughts in balanced awareness

      Research findings:
      - Self-compassion predicts lower depression, anxiety, stress
      - More effective than self-esteem for emotional regulation
      - Linked to greater motivation and resilience
      - Protects against perfectionism's negative effects

      Self-compassion practices:
      - Self-compassion break: 'This is a moment of suffering.
        Suffering is part of life. May I be kind to myself.'
      - Write a letter to yourself as you would to a good friend
      - Notice self-critical voice, give it a name, respond with kindness

      For Indians specifically:
      - Collectivist culture can make self-compassion feel selfish
      - Reframe: 'I can't pour from an empty cup'
      - Self-care is not selfishness — it enables you to show up for others

      Common misconception: self-compassion = weakness or laziness
      Reality: research shows self-compassionate people take MORE
      responsibility for mistakes and work harder to improve
    `.trim()
  },
  {
    id: 'sleep-mental-health',
    title: 'Sleep and Mental Health',
    source: 'PubMed Central Open Access',
    content: `
      Sleep and mental health are bidirectionally linked:
      - Poor sleep worsens depression, anxiety, irritability
      - Mental health issues disrupt sleep
      - Treating sleep often improves mental health symptoms

      Sleep hygiene basics:
      - Consistent sleep/wake times — even weekends
      - No screens 1 hour before bed (blue light suppresses melatonin)
      - Cool, dark room (18-20°C ideal)
      - No caffeine after 2pm
      - Bed only for sleep (not work, not phone)

      For racing thoughts at night:
      - Write a to-do list for tomorrow before bed (offloads worry)
      - 4-7-8 breathing
      - Body scan relaxation
      - If awake >20 mins, get up and do something calm

      Indian context:
      - Late night phone use very common among young Indians
      - Academic pressure causes delayed sleep phase
      - Shared bedrooms can make sleep hygiene harder
      - Summer heat in many Indian cities disrupts sleep
    `.trim()
  },
  {
    id: 'loneliness-connection',
    title: 'Loneliness and Social Connection',
    source: 'PubMed Central Open Access',
    content: `
      Loneliness is one of the strongest predictors of poor mental health.
      Research shows chronic loneliness is as harmful as smoking 15 cigarettes/day.

      Types of loneliness:
      - Social loneliness: lack of social network
      - Emotional loneliness: lack of close intimate relationships
      - Existential loneliness: feeling fundamentally misunderstood

      Paradox of modern loneliness:
      - More connected digitally, more lonely emotionally
      - Social media increases social comparison, worsens loneliness
      - Quality of connections matters more than quantity

      For young Indians:
      - Moving to new city for work/college = sudden loss of support network
      - Pressure to appear happy on social media
      - Difficulty making deep friendships in competitive environments

      Building connection:
      - Small interactions matter (neighbor, shopkeeper, colleague)
      - Shared activities > conversations for building friendship
      - Vulnerability is the foundation of real connection
      - Online communities can supplement but not replace in-person

      When loneliness persists despite efforts:
      - May indicate depression — professional help recommended
      - iCall counsellors specifically trained for this
    `.trim()
  }
];

console.log(`Embedding ${papers.length} papers into Pinecone index: ${process.env.PINECONE_INDEX_NAME}\n`);

for (const paper of papers) {
  process.stdout.write(`  Embedding: ${paper.title} ... `);
  try {
    const values = await embed(`${paper.title}\n\n${paper.content}`);
    await index.upsert([{
      id: paper.id,
      values,
      metadata: {
        title: paper.title,
        source: paper.source,
        content: paper.content,
      },
    }]);
    console.log('✓');
  } catch (e) {
    console.log(`✗ FAILED: ${e.message}`);
  }
}

console.log('\nDone. Papers are now in Pinecone — no need to re-run this script.');
