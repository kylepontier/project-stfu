// ============================================================================
// defaults.js — Default configuration for Project STFU
// ============================================================================
// This file contains all the "knobs" you can turn to change how the app
// behaves. Every threshold, timing, and keyword list lives here so you
// can tweak them in one place without digging through logic code.
//
// AFD PRINCIPLE: Data layer is separate from logic. Logic reads these
// defaults but never hardcodes values. You can swap configs without
// changing any logic code.
// ============================================================================

/**
 * THRESHOLDS — How long you've been talking determines your alert level.
 *
 * Think of it like a traffic light:
 *   - Green:  Under 45 seconds — you're fine, keep going
 *   - Yellow: 45 to 90 seconds — getting long, start wrapping up
 *   - Red:    Over 90 seconds  — you're monologuing, stop and let others talk
 *
 * These numbers are in SECONDS.
 */
export const THRESHOLDS = {
  greenMax: 45,    // Up to 45 seconds = green (all good)
  yellowMax: 90,   // 45 to 90 seconds = yellow (wrapping up)
  // Anything above yellowMax = red (stop talking)
};

/**
 * ESCALATION — What happens when you keep hitting yellow/red.
 *
 * If you keep monologuing across multiple transcript chunks,
 * the warnings get more urgent. This controls how that works.
 */
export const ESCALATION = {
  // How many consecutive yellow/red chunks before we escalate
  warningsBeforeEscalate: 2,

  // Maximum escalation level (0 = normal, 1 = elevated, 2 = urgent)
  maxLevel: 2,
};

/**
 * ANALYSIS — Keywords and patterns used to detect speaking style.
 *
 * These are simple word lists. No fancy AI — just pattern matching.
 * If your speech contains many of these words, it's a signal that
 * you might be over-explaining, getting defensive, or being too abstract.
 */
export const ANALYSIS = {
  // Words that suggest you're over-explaining
  overExplanatoryKeywords: [
    'basically', 'essentially', 'fundamentally', 'the thing is',
    'what i mean is', 'let me explain', 'to be clear', 'in other words',
    'the point is', 'what im saying is', 'so basically',
    'the reason is', 'the way i see it',
  ],

  // Words that suggest you're being defensive
  defensiveKeywords: [
    'but', 'however', 'actually', 'no but', 'thats not what i',
    'i never said', 'you dont understand', 'let me finish',
    'thats not fair', 'i was just', 'im not saying',
    'to be fair', 'in my defense',
  ],

  // Words that suggest you're being too abstract (not concrete)
  abstractKeywords: [
    'theoretically', 'conceptually', 'philosophically', 'in general',
    'broadly speaking', 'at a high level', 'the idea is',
    'in principle', 'hypothetically', 'from a strategic standpoint',
    'paradigm', 'framework', 'holistically',
  ],

  // How many keyword hits (out of total words) triggers a warning
  // 0.03 = 3% of your words are flagged keywords
  keywordDensityThreshold: 0.03,

  // Per-category thresholds — lets you tune sensitivity for each tone
  // independently. If a category isn't listed here, it falls back to
  // the global keywordDensityThreshold above.
  //
  // Why is defensive higher? Words like 'but' and 'however' are common
  // in normal speech. A higher threshold reduces false positives.
  perCategoryThresholds: {
    'over-explanatory': 0.03,
    'defensive': 0.04,    // Raised from 0.03 — 'but'/'however' are common in normal speech
    'abstract': 0.03,
  },

  // Simple patterns that look like questions
  // If none of these appear in your recent speech, that's a warning sign
  questionPatterns: [
    'what do you think',
    'does that make sense',
    'what are your thoughts',
    'do you agree',
    'how do you feel',
    'any questions',
    'what would you',
    'how would you',
    'right?',
    'yeah?',
    'no?',
    '?',  // Any sentence ending in a question mark
  ],

  // ========================================================================
  // V2 SIGNALS — More specific monologue pattern detection
  // ========================================================================

  // PREAMBLE DETECTION — "Over-contextualizing before landing the point"
  // These phrases signal that you're winding up / setting context
  // instead of getting to your actual point.
  preambleKeywords: [
    'so the context is', 'to give you some background',
    'before i get to my point', 'the reason im bringing this up',
    'just to set the stage', 'so what happened was',
    'the backstory here is', 'let me start by saying',
    'first some context', 'a little background',
    'to back up a bit', 'so the history here is',
  ],

  // Minimum words before preamble detection kicks in.
  // Short chunks shouldn't be flagged — you need enough text to
  // actually have a "first half" and "second half."
  preambleMinWords: 40,

  // CONCLUSION MARKERS — Phrases that signal "I'm making my point now."
  // If a lot of text comes AFTER one of these, you're probably rambling
  // past your point.
  conclusionMarkers: [
    'so in short', 'the bottom line is', 'my recommendation is',
    'i think we should', 'the point is', 'so basically',
    'what im saying is', 'to sum up', 'in summary',
    'so my take is', 'the tldr is', 'long story short',
  ],

  // RAMBLE CONTINUATION — Phrases that appear when you keep going
  // after you've already made your point. "And also... plus... oh and..."
  rambleContinuationPhrases: [
    'and also', 'and another thing', 'plus', 'on top of that',
    'not to mention', 'oh and', 'one more thing',
    'and i also want to say', 'while im at it',
  ],

  // What percentage of text AFTER the first conclusion marker is considered
  // "too much"? 0.4 = if 40% or more of your words come after the point,
  // you're rambling past it.
  postPointRambleThreshold: 0.4,

  // CONCRETE INDICATORS — Signs that you're grounding your speech
  // in specifics (good!) rather than staying abstract (bad).
  // Used to compute an abstract-vs-concrete ratio.
  concreteIndicators: [
    'for example', 'specifically', 'last week', 'last tuesday',
    'last monday', 'yesterday', 'this morning',
    'the customer said', 'we shipped', 'the data shows',
    'percent', 'dollars', 'users', 'minutes', 'hours',
    'the number is', 'in the meeting', 'on the call',
  ],

  // If abstractScore / (abstractScore + concreteScore + 1) is above this,
  // the speech is too abstract relative to how concrete it is.
  // 0.7 = abstract keywords outweigh concrete ones by more than 2:1.
  abstractVsConcreteThreshold: 0.7,

  // ENGAGEMENT QUESTION PATTERNS — Genuine invitations for others to speak.
  // These are the "real" questions, as opposed to rhetorical ones.
  // Used for the new "floor handback" detection.
  engagementQuestionPatterns: [
    'what do you think',
    'does that make sense',
    'what are your thoughts',
    'any questions',
    'how would you',
    'what would you',
    'how do you feel',
    'do you agree',
    'your take',
    'your thoughts',
    'want to weigh in',
    'does anyone',
  ],

  // RHETORICAL PATTERNS — Tag questions and filler questions that don't
  // genuinely invite a response. "Right? Yeah? No?"
  // These count for hasQuestion (backward compat) but NOT for hasFloorHandback.
  rhetoricalPatterns: [
    'right?', 'yeah?', 'no?', 'isnt it', 'dont you think',
    'you know what i mean', 'know what i mean',
  ],

  // What percentage of the text (from the end) counts as the
  // "floor handback window"? 0.2 = the last 20% of words.
  // A genuine engagement question should appear near the END of your
  // speech — that's what handing the floor back looks like.
  floorHandbackWindowPct: 0.2,
};

/**
 * COACHING MESSAGES — What the app says to you at each alert level.
 *
 * Each level has a list of messages. The app cycles through them so
 * you don't see the same message over and over.
 */
export const COACHING_MESSAGES = {
  green: [
    'You\'re doing great. Keep the flow natural.',
    'Good pace. Stay engaged.',
    'Conversational balance looks healthy.',
  ],

  yellow: [
    'Getting long — consider wrapping up your point.',
    'Try asking a question to involve others.',
    'You\'ve been talking a while. Pause and listen.',
    'Good content, but time to let others respond.',
  ],

  red: [
    'Wrap it up now.',
    'Stop and ask a question.',
    'Pause. Let them respond.',
    'You\'re monologuing. Take a breath and stop.',
    'Hand it back to the group.',
  ],

  // Extra-urgent messages when escalation level is maxed out
  escalated: [
    'STOP TALKING. Seriously. Ask a question right now.',
    'You have been going for too long. Full stop.',
    'This is a pattern. Pause, breathe, and listen.',
  ],

  // CONTEXT-AWARE MESSAGES (V2) — Specific messages based on WHY you
  // were flagged. Instead of a generic "wrap it up," the coach now tells
  // you WHAT you're doing wrong.
  contextual: {
    preamble: [
      'Get to the point faster — you\'re over-contextualizing.',
      'Lead with the point, not the background.',
      'Your listener has the context. State what you actually think.',
    ],
    postPointRamble: [
      'Your point already landed. Stop and let them respond.',
      'You made the point. Adding more dilutes it.',
      'You said it. Now stop. Let them react.',
    ],
    abstract: [
      'Too abstract. Give a specific example.',
      'Ground this in something concrete — a number, a story, a name.',
      'What does this look like in practice? Say that instead.',
    ],
    noFloorHandback: [
      'You haven\'t invited them to respond. Ask a question.',
      'Hand the floor back. Try: "What do you think?"',
      'You\'re holding the floor. Let go. Ask something.',
    ],
    // Rolling context messages — triggered by multi-chunk patterns
    sustainedMonologue: [
      'Multiple turns without inviting a response. Pause and ask a question.',
      'You\'ve been holding the floor for several chunks. Let someone else in.',
      'Pattern: talking without check-ins. Try asking what they think.',
    ],
    continuingAfterPoint: [
      'You made your point earlier. This is elaboration — let it land.',
      'The point already landed in a previous turn. Stop and listen.',
      'You\'re building on a point you already made. Let them respond first.',
    ],
    chronicPreamble: [
      'You keep front-loading context. Lead with the point, then add context if asked.',
      'Pattern: over-contextualizing across turns. State what you think first.',
      'Multiple chunks of setup. Your listeners have the context — get to it.',
    ],
  },
};

/**
 * WORD_RATE — Approximate words per second for estimating speaking duration.
 *
 * Average speaking rate is about 2.5 words per second (150 words per minute).
 * We use this to estimate how long a chunk of text took to say.
 */
export const WORDS_PER_SECOND = 2.5;

/**
 * COACHING — Constants that control coaching decisions.
 *
 * These were previously hardcoded as magic numbers inside coach.js.
 * Moving them here follows the AFD principle: all knobs in one place.
 */
export const COACHING = {
  // If you're in the green zone but past this percentage of greenMax
  // AND you haven't asked a question, you get bumped to yellow.
  // 0.7 = 70% of greenMax (31.5 seconds with default 45s greenMax)
  noQuestionBumpThreshold: 0.7,

  // Minimum number of words in a chunk before the "no question" penalty
  // applies. Very short chunks (under 20 words) are too brief to judge.
  noQuestionMinWords: 20,
};

/**
 * CONTEXT — Configuration for the rolling conversational context layer.
 *
 * The context module looks at recent chunks (not just the current one)
 * to detect patterns that only emerge over time — like talking for 4
 * chunks straight without inviting anyone to speak, or continuing to
 * elaborate after a point was already made in an earlier chunk.
 */
export const CONTEXT = {
  // How many recent chunks to examine. 3 is a good balance:
  // enough to detect patterns, not so many that stale data matters.
  windowSize: 3,

  // How many consecutive chunks without floor handback before
  // the context layer fires a "sustained monologue" signal.
  // 2 = they skipped handing back the floor twice in a row.
  sustainedMonologueThreshold: 2,

  // How many chunks with preamble in the recent window before
  // the context layer flags chronic over-contextualizing.
  // 2 = preamble in 2 out of the last 3-4 chunks.
  chronicPreambleThreshold: 2,
};

/**
 * SESSION DEFAULTS — Initial state for a new session.
 */
export const SESSION_DEFAULTS = {
  status: 'idle',  // 'idle', 'active', 'stopped'
};
