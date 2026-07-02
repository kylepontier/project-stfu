// ============================================================================
// context.js — Rolling conversational context for Project STFU
// ============================================================================
// This module looks at RECENT chunks (not just the current one) and computes
// rolling signals that help the coach make better decisions.
//
// Without this module, every chunk is judged in isolation:
//   "Is THIS chunk too long? Does THIS chunk have a question?"
//
// With this module, the coach can also ask:
//   "Has this person been talking for 3 chunks straight without inviting
//    anyone else to speak? Did they already make their point two chunks
//    ago and they're STILL going?"
//
// HOW IT WORKS:
//   1. The command layer passes in the session's recent chunks + current analysis
//   2. This module computes a `contextSignals` object
//   3. The coach reads those signals and applies additional bumps
//
// AFD PRINCIPLE: This is a pure function module. It doesn't store data,
// modify sessions, or pick messages. It just computes signals from data
// that already exists in the session store.
// ============================================================================

import { CONTEXT } from '../data/defaults.js';

/**
 * Compute rolling context signals from recent chunks and the current analysis.
 *
 * These signals give the coach a "memory" across multiple chunks so it can
 * detect patterns that only emerge over time — like a person who hasn't
 * handed the floor back in 4 consecutive chunks, or someone who made their
 * point 2 chunks ago but is still elaborating.
 *
 * @param {object[]} recentChunks — The last N stored chunks from the session
 *   Each chunk has: { text, wordCount, estimatedSeconds, hasQuestion,
 *                      toneFlags, coachingState, hasFloorHandback,
 *                      hasPreamblePattern, hasPostPointRamble }
 * @param {object} currentAnalysis — The analysis of the chunk being processed NOW
 * @returns {object} contextSignals — Rolling signals for the coach
 */
export function computeContext(recentChunks, currentAnalysis) {
  const windowSize = CONTEXT.windowSize;

  // Take only the last `windowSize` chunks (not including current — current
  // is in `currentAnalysis`, the chunks array hasn't been updated yet).
  const window = recentChunks.slice(-windowSize);

  // ------------------------------------------------------------------
  // Signal 1: recentSpeakingSeconds
  //
  // How many seconds has this person been speaking across the recent
  // window of chunks? This is different from totalSpeakingSeconds
  // (which is cumulative for the entire session). The rolling window
  // captures "how much have you talked RECENTLY" — a person who was
  // green for 10 minutes but then fires off 3 long chunks in a row
  // should be flagged.
  // ------------------------------------------------------------------
  const recentSpeakingSeconds = window.reduce(
    (sum, chunk) => sum + (chunk.estimatedSeconds || 0), 0
  ) + (currentAnalysis.estimatedSeconds || 0);

  // ------------------------------------------------------------------
  // Signal 2: chunksWithoutHandback
  //
  // How many consecutive chunks (ending with the current one) have
  // gone by without a floor handback? If someone talks for 4 chunks
  // in a row without ever asking "what do you think?", that's a strong
  // signal they're monologuing even if each individual chunk is short.
  //
  // We count backward from the current chunk. As soon as we hit a
  // chunk that DID hand back the floor, we stop counting.
  // ------------------------------------------------------------------
  let chunksWithoutHandback = 0;

  // Check the current chunk first
  const currentHandback = (currentAnalysis.hasFloorHandback !== undefined)
    ? currentAnalysis.hasFloorHandback
    : currentAnalysis.hasQuestion;

  if (!currentHandback) {
    chunksWithoutHandback = 1;

    // Now walk backward through the recent window
    for (let i = window.length - 1; i >= 0; i--) {
      const chunk = window[i];
      // Use hasFloorHandback if available, fall back to hasQuestion
      const hadHandback = (chunk.hasFloorHandback !== undefined)
        ? chunk.hasFloorHandback
        : chunk.hasQuestion;

      if (hadHandback) break; // They handed back here — stop counting
      chunksWithoutHandback++;
    }
  }
  // If current chunk HAS a handback, the streak is 0.

  // ------------------------------------------------------------------
  // Signal 3: pointMadeInRecentChunk
  //
  // Did any chunk in the recent window contain a conclusion marker
  // (hasPostPointRamble) or the current analysis says post-point?
  // If a point was ALREADY made recently and the speaker is still
  // going, they're likely elaborating past the point across chunks.
  // ------------------------------------------------------------------
  const pointMadeInRecentChunk = window.some(
    chunk => chunk.hasPostPointRamble === true
  );

  // ------------------------------------------------------------------
  // Signal 4: currentContinuesAfterPoint
  //
  // True when: a point was made in a recent chunk AND the current
  // chunk does NOT contain its own conclusion marker. This suggests
  // the speaker made their point already but is continuing to talk
  // without making a new point — cross-chunk rambling.
  //
  // If the current chunk ALSO has hasPostPointRamble, that means
  // they're making AND rambling past a new point in this chunk,
  // which the single-chunk detector already catches.
  // ------------------------------------------------------------------
  const currentContinuesAfterPoint = (
    pointMadeInRecentChunk &&
    !currentAnalysis.hasPostPointRamble
  );

  // ------------------------------------------------------------------
  // Signal 5: recentPreambleCount
  //
  // How many chunks in the recent window had preamble detected?
  // A single preamble is fine — everyone sets context sometimes.
  // But if 2 out of 3 recent chunks are preamble-heavy, the speaker
  // is chronically over-contextualizing.
  // ------------------------------------------------------------------
  const recentPreambleCount = window.filter(
    chunk => chunk.hasPreamblePattern === true
  ).length + (currentAnalysis.hasPreamblePattern ? 1 : 0);

  // ------------------------------------------------------------------
  // Build and return the context signals object
  // ------------------------------------------------------------------
  return {
    // How many recent chunks were examined (for transparency/debugging)
    windowSize: window.length + 1, // +1 for current

    // Signal 1: Total speaking time across the rolling window
    recentSpeakingSeconds,

    // Signal 2: Consecutive chunks without handing the floor back
    chunksWithoutHandback,

    // Signal 3: Whether a conclusion/point was made in a recent chunk
    pointMadeInRecentChunk,

    // Signal 4: Current chunk appears to continue past a previous point
    currentContinuesAfterPoint,

    // Signal 5: How many chunks in the window had preamble patterns
    recentPreambleCount,
  };
}
