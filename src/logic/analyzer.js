// ============================================================================
// analyzer.js — Transcript analysis for Project STFU
// ============================================================================
// This module takes a chunk of text (what you just said in a call)
// and analyzes it for:
//   1. How long you were probably speaking (estimated from word count)
//   2. Whether you asked a question recently
//   3. Whether your language sounds over-explanatory, defensive, or abstract
//
// V2 ADDITIONS:
//   4. Whether you're over-contextualizing before the point (preamble)
//   5. Whether you keep talking after making the point (post-point ramble)
//   6. Whether your speech is abstract vs concrete (ratio, not just density)
//   7. Whether you genuinely handed the floor back (not just a rhetorical "right?")
//
// It returns a raw analysis object. It does NOT decide the coaching state —
// that's the coach's job. This module just gathers the facts.
//
// AFD PRINCIPLE: Single responsibility. The analyzer analyzes.
// It doesn't coach, escalate, or store data. Clean separation.
// ============================================================================

import {
  ANALYSIS,
  WORDS_PER_SECOND,
} from '../data/defaults.js';

/**
 * Analyze a transcript chunk.
 *
 * Takes the raw text and produces a structured analysis:
 * - How many words
 * - Estimated speaking duration in seconds
 * - Whether it contains a question
 * - Keyword density for each warning category
 *
 * @param {string} text — The transcript text to analyze
 * @returns {object} Analysis result with all the metrics
 */
export function analyzeChunk(text) {
  // Guard: if no text, return an empty analysis
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      wordCount: 0,
      estimatedSeconds: 0,
      hasQuestion: false,
      overExplanatoryScore: 0,
      defensiveScore: 0,
      abstractScore: 0,
      toneFlags: [],
      raw: '',
      // V2 fields
      hasPreamblePattern: false,
      preambleScore: 0,
      hasPostPointRamble: false,
      postPointScore: 0,
      concreteScore: 0,
      hasFloorHandback: false,
    };
  }

  // Normalize the text: lowercase, trim whitespace
  const normalized = text.toLowerCase().trim();

  // Count words (split on whitespace)
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Estimate how many seconds this took to say
  // Average person speaks ~2.5 words per second
  const estimatedSeconds = Math.round(wordCount / WORDS_PER_SECOND);

  // Check if the speaker asked a question
  const hasQuestion = detectQuestion(normalized);

  // Check for tone patterns
  const overExplanatoryScore = countKeywordHits(normalized, ANALYSIS.overExplanatoryKeywords);
  const defensiveScore = countKeywordHits(normalized, ANALYSIS.defensiveKeywords);
  const abstractScore = countKeywordHits(normalized, ANALYSIS.abstractKeywords);

  // Build a list of tone flags (things that were detected)
  // Each category can have its own sensitivity threshold.
  // Falls back to the global keywordDensityThreshold if no per-category value exists.
  const toneFlags = [];
  const globalThreshold = ANALYSIS.keywordDensityThreshold;
  const perCat = ANALYSIS.perCategoryThresholds || {};

  if (wordCount > 0 && overExplanatoryScore / wordCount >= (perCat['over-explanatory'] ?? globalThreshold)) {
    toneFlags.push('over-explanatory');
  }
  if (wordCount > 0 && defensiveScore / wordCount >= (perCat['defensive'] ?? globalThreshold)) {
    toneFlags.push('defensive');
  }
  // V2: Compute concrete score for abstract-vs-concrete ratio
  const concreteScore = countKeywordHits(normalized, ANALYSIS.concreteIndicators || []);

  // V2: Abstract flag now uses the ratio of abstract-to-concrete when possible.
  // If you say a lot of abstract words but ALSO a lot of concrete words,
  // you're grounding your abstractions — so don't flag it.
  const absConcreteRatio = abstractScore / (abstractScore + concreteScore + 1);
  const abstractRatioThreshold = ANALYSIS.abstractVsConcreteThreshold || 0.7;

  if (wordCount > 0 && abstractScore > 0 && absConcreteRatio >= abstractRatioThreshold) {
    // Ratio-based: abstract keywords dominate over concrete ones
    toneFlags.push('abstract');
  } else if (wordCount > 0 && abstractScore / wordCount >= (perCat['abstract'] ?? globalThreshold)) {
    // Fallback to density-based if no concrete indicators configured
    toneFlags.push('abstract');
  }

  // ========================================================================
  // V2 SIGNALS
  // ========================================================================

  // Preamble detection: is the first half of the text heavy with setup phrases?
  const preamble = detectPreamblePattern(normalized, wordCount);

  // Post-point ramble: does the text continue extensively after a conclusion marker?
  const postPoint = detectPostPointRamble(normalized, wordCount);

  // Floor handback: does the speaker genuinely invite others to respond
  // near the end of their speech (not just a rhetorical "right?")?
  const hasFloorHandback = detectFloorHandback(normalized, wordCount);

  return {
    // V1 fields (unchanged)
    wordCount,
    estimatedSeconds,
    hasQuestion,
    overExplanatoryScore,
    defensiveScore,
    abstractScore,
    toneFlags,
    raw: text.trim(),

    // V2 fields
    hasPreamblePattern: preamble.hasPreamblePattern,
    preambleScore: preamble.preambleScore,
    hasPostPointRamble: postPoint.hasPostPointRamble,
    postPointScore: postPoint.postPointScore,
    concreteScore,
    hasFloorHandback,
  };
}

// ============================================================================
// HELPER FUNCTIONS (internal — not exported)
// ============================================================================

/**
 * Count how many times keywords from a list appear in the text.
 *
 * This does a simple substring search for each keyword.
 * It's intentionally simple — no regex, no stemming, no NLP.
 *
 * @param {string} text — Lowercase normalized text
 * @param {string[]} keywords — List of keywords/phrases to look for
 * @returns {number} Total number of keyword hits
 */
function countKeywordHits(text, keywords) {
  let hits = 0;

  for (const keyword of keywords) {
    // Count how many times this keyword appears in the text
    let searchFrom = 0;
    while (true) {
      const index = text.indexOf(keyword, searchFrom);
      if (index === -1) break;
      hits++;
      searchFrom = index + keyword.length;
    }
  }

  return hits;
}

/**
 * Detect whether the text contains a question.
 *
 * Checks for question marks and common question phrases.
 * Intentionally simple — just pattern matching, no ML.
 *
 * @param {string} text — Lowercase normalized text
 * @returns {boolean} True if a question was detected
 */
function detectQuestion(text) {
  for (const pattern of ANALYSIS.questionPatterns) {
    if (text.includes(pattern)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// V2 HELPER FUNCTIONS
// ============================================================================

/**
 * Detect whether the speaker is over-contextualizing before getting to the point.
 *
 * HOW IT WORKS:
 * - Split the text in half by word count (first half vs second half).
 * - Count preamble keywords in the first half.
 * - If the first half has 2+ preamble hits and the chunk is long enough,
 *   flag it as a preamble pattern.
 *
 * WHY THIS WORKS:
 * People who over-contextualize front-load their speech with setup phrases.
 * If phrases like "to give you some background" and "the backstory here is"
 * cluster in the first half, the speaker is winding up too long.
 *
 * LIMITATIONS:
 * - Short chunks (under preambleMinWords) are skipped — not enough text to judge.
 * - Someone who deliberately puts brief context first will occasionally get flagged.
 *
 * @param {string} text — Lowercase normalized text
 * @param {number} wordCount — Total word count
 * @returns {object} { hasPreamblePattern: boolean, preambleScore: number }
 */
function detectPreamblePattern(text, wordCount) {
  const keywords = ANALYSIS.preambleKeywords || [];
  const minWords = ANALYSIS.preambleMinWords || 40;

  // Too short to judge
  if (wordCount < minWords || keywords.length === 0) {
    return { hasPreamblePattern: false, preambleScore: 0 };
  }

  // Split text roughly in half by finding the midpoint
  const words = text.split(/\s+/);
  const midpoint = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, midpoint).join(' ');

  // Count preamble keyword hits in the first half only
  const preambleScore = countKeywordHits(firstHalf, keywords);

  // Flag if 2 or more preamble phrases appear in the first half
  return {
    hasPreamblePattern: preambleScore >= 2,
    preambleScore,
  };
}

/**
 * Detect whether the speaker keeps talking after making their point.
 *
 * HOW IT WORKS:
 * - Scan for the FIRST conclusion marker in the text.
 * - If found, measure how many words come AFTER it.
 * - If more than postPointRambleThreshold (default 40%) of the total
 *   text comes after the conclusion marker, flag it.
 * - Also count "continuation phrases" after the marker for scoring.
 *
 * WHY THIS WORKS:
 * When someone says "so in short, we should do X" and then keeps going
 * for another 50 words, they're rambling past their point.
 *
 * LIMITATIONS:
 * - If someone says "the point is" early in a genuinely new point, false positive.
 * - Only checks the FIRST conclusion marker, not all of them.
 *
 * @param {string} text — Lowercase normalized text
 * @param {number} wordCount — Total word count
 * @returns {object} { hasPostPointRamble: boolean, postPointScore: number }
 */
function detectPostPointRamble(text, wordCount) {
  const markers = ANALYSIS.conclusionMarkers || [];
  const continuations = ANALYSIS.rambleContinuationPhrases || [];
  const threshold = ANALYSIS.postPointRambleThreshold || 0.4;

  // Need enough text to have a point AND rambling after it
  if (wordCount < 30 || markers.length === 0) {
    return { hasPostPointRamble: false, postPointScore: 0 };
  }

  // Find the first conclusion marker in the text
  let earliestIndex = -1;
  let markerLength = 0;

  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
      earliestIndex = index;
      markerLength = marker.length;
    }
  }

  // No conclusion marker found — can't detect post-point ramble
  if (earliestIndex === -1) {
    return { hasPostPointRamble: false, postPointScore: 0 };
  }

  // Get the text AFTER the conclusion marker
  const textAfterPoint = text.slice(earliestIndex + markerLength);
  const wordsAfter = textAfterPoint.split(/\s+/).filter(w => w.length > 0).length;
  const ratioAfter = wordsAfter / wordCount;

  // Count continuation phrases in the post-point text
  const postPointScore = countKeywordHits(textAfterPoint, continuations);

  return {
    hasPostPointRamble: ratioAfter >= threshold,
    postPointScore,
  };
}

/**
 * Detect whether the speaker genuinely handed the floor back.
 *
 * HOW IT WORKS:
 * - Look at the LAST 20% of the text (configurable via floorHandbackWindowPct).
 * - Check if any ENGAGEMENT question patterns appear in that window.
 * - Rhetorical patterns ("right?", "yeah?") do NOT count.
 *
 * WHY THIS IS BETTER THAN hasQuestion:
 * hasQuestion returns true if ANY "?" appears anywhere. That means a rhetorical
 * "right?" buried in the middle counts the same as "What do you think?" at the end.
 * hasFloorHandback only fires when a genuine engagement question appears near the
 * end — which is what actually handing the floor back looks like.
 *
 * @param {string} text — Lowercase normalized text
 * @param {number} wordCount — Total word count
 * @returns {boolean} True if a genuine floor handback was detected
 */
function detectFloorHandback(text, wordCount) {
  const engagementPatterns = ANALYSIS.engagementQuestionPatterns || [];
  const windowPct = ANALYSIS.floorHandbackWindowPct || 0.2;

  if (wordCount === 0 || engagementPatterns.length === 0) {
    return false;
  }

  // Get the last N% of the text by word position
  const words = text.split(/\s+/);
  const windowStart = Math.floor(words.length * (1 - windowPct));
  const tailText = words.slice(windowStart).join(' ');

  // Check if any engagement question pattern appears in the tail
  for (const pattern of engagementPatterns) {
    if (tailText.includes(pattern)) {
      return true;
    }
  }

  // Also check: does the tail end with a question mark?
  // (This catches questions like "How should we handle that?" that aren't
  // in the engagement list but are still genuine invitations.)
  // Exclude rhetorical patterns from this check.
  if (tailText.trimEnd().endsWith('?')) {
    const rhetoricalPatterns = ANALYSIS.rhetoricalPatterns || [];
    const isRhetorical = rhetoricalPatterns.some(rp => tailText.includes(rp));
    if (!isRhetorical) {
      return true;
    }
  }

  return false;
}
