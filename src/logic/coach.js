// ============================================================================
// coach.js — Coaching engine for Project STFU
// ============================================================================
// The coach takes an analysis (from the analyzer) and the current session
// state, then decides:
//   1. What coaching state to assign (green / yellow / red)
//   2. What coaching message to show
//
// It's like a sports coach watching from the sideline:
// The analyzer gathers the stats, and the coach decides what to tell you.
//
// AFD PRINCIPLE: This module reads from defaults for messages/thresholds
// and takes analysis as input. It doesn't analyze text or store data.
// Pure decision-making logic.
// ============================================================================

import { COACHING_MESSAGES, THRESHOLDS, COACHING, CONTEXT } from '../data/defaults.js';

/**
 * Determine the coaching state based on analysis and session context.
 *
 * The coaching state is like a traffic light:
 *   - green  = you're fine
 *   - yellow = getting long
 *   - red    = wrap it up
 *
 * The state is determined by:
 *   1. How long you've been speaking (total seconds across all chunks)
 *   2. Whether you handed the floor back (V2: upgraded from simple question check)
 *   2.5. Whether V2 patterns were detected (preamble, post-point ramble)
 *   3. Whether tone flags were detected
 *   4. Current escalation level
 *
 * V2: Now also returns a `primaryReason` string explaining WHY the state
 * was chosen, so the coach can pick context-specific messages.
 *
 * V3: Accepts optional `contextSignals` from the rolling context layer.
 * If provided, the coach uses cross-chunk patterns (sustained monologue,
 * continuing after a prior point, chronic preamble) as additional bumps.
 * If null/undefined, this step is skipped — fully backward compatible.
 *
 * @param {object} analysis — The analysis result from analyzer.js
 * @param {object} sessionData — Current session state from the store
 * @param {object|null} [contextSignals] — Rolling context signals (optional)
 * @returns {object} Coaching decision: { state, message, reasoning, primaryReason, totalSeconds }
 */
export function determineCoaching(analysis, sessionData, contextSignals) {
  const thresholds = sessionData.thresholds || THRESHOLDS;

  // Calculate the total speaking time including this new chunk
  const totalSeconds = sessionData.totalSpeakingSeconds + analysis.estimatedSeconds;

  // Track what caused the state to change — used for context-aware messaging.
  // Starts as 'duration' (the default reason) and gets overwritten by more
  // specific reasons if they fire.
  let primaryReason = 'duration';

  // ------------------------------------------------------------------
  // Step 1: Determine base state from speaking duration
  // ------------------------------------------------------------------
  let state = 'green';

  if (totalSeconds > thresholds.yellowMax) {
    state = 'red';
    primaryReason = 'duration';
  } else if (totalSeconds > thresholds.greenMax) {
    state = 'yellow';
    primaryReason = 'duration';
  }

  // ------------------------------------------------------------------
  // Step 2: Increase severity if the floor wasn't handed back
  //
  // V2 UPGRADE: Uses hasFloorHandback (genuine engagement question at the end)
  // instead of hasQuestion (any "?" anywhere). Falls back to hasQuestion
  // if hasFloorHandback is not available (backward compat with V1 analysis).
  // ------------------------------------------------------------------
  const minWords = COACHING.noQuestionMinWords;
  const bumpPct = COACHING.noQuestionBumpThreshold;

  // V2: prefer hasFloorHandback; fall back to hasQuestion for backward compat
  const handedFloorBack = (analysis.hasFloorHandback !== undefined)
    ? analysis.hasFloorHandback
    : analysis.hasQuestion;

  if (!handedFloorBack && analysis.wordCount > minWords) {
    if (state === 'green' && totalSeconds > thresholds.greenMax * bumpPct) {
      state = 'yellow';
      primaryReason = 'noFloorHandback';
    } else if (state === 'yellow') {
      state = 'red';
      primaryReason = 'noFloorHandback';
    }
  }

  // ------------------------------------------------------------------
  // Step 2.5 (V2): Pattern-based bumps — preamble and post-point ramble
  //
  // These are NEW signals from the V2 analyzer. If the analysis object
  // doesn't include them (e.g., in old tests), they're undefined/falsy
  // and this block does nothing. Backward compatible.
  // ------------------------------------------------------------------
  if (analysis.hasPreamblePattern) {
    if (state === 'green') {
      state = 'yellow';
      primaryReason = 'preamble';
    }
  }

  if (analysis.hasPostPointRamble) {
    if (state === 'green') {
      state = 'yellow';
      primaryReason = 'postPointRamble';
    }
    // Both preamble AND post-point ramble = winding up AND not stopping.
    // That's a double signal — bump yellow to red.
    if (state === 'yellow' && analysis.hasPreamblePattern) {
      state = 'red';
      primaryReason = 'combined';
    }
  }

  // ------------------------------------------------------------------
  // Step 2.75 (V3): Rolling context bumps
  //
  // If the context layer computed cross-chunk signals, use them here.
  // These catch patterns that single-chunk analysis misses — like
  // talking for 3 chunks without ever handing back the floor, or
  // continuing to elaborate on a point made in a previous chunk.
  //
  // If contextSignals is null/undefined, this block does nothing.
  // Backward compatible with all existing tests.
  //
  // REASON SELECTION: State bumps and reason selection are decoupled.
  // Each check bumps the state independently, and we collect which
  // context reasons fired. After all bumps, we pick the MOST SPECIFIC
  // reason using a priority list. This prevents the generic
  // "sustainedMonologue" from winning when a more specific reason
  // (like "continuingAfterPoint") also fired but couldn't overwrite
  // because the state was already bumped to red.
  //
  // Priority (most specific first):
  //   1. continuingAfterPoint — you made a point already, stop elaborating
  //   2. chronicPreamble      — chronic setup across multiple chunks
  //   3. sustainedMonologue   — generic fallback (no handback for N chunks)
  // ------------------------------------------------------------------
  if (contextSignals) {
    // Track which context reasons actually fired (regardless of bumps)
    const contextReasonsFired = [];

    // Sustained monologue: multiple consecutive chunks without floor handback
    if (contextSignals.chunksWithoutHandback >= CONTEXT.sustainedMonologueThreshold) {
      if (state === 'green') {
        state = 'yellow';
      } else if (state === 'yellow') {
        state = 'red';
      }
      contextReasonsFired.push('sustainedMonologue');
    }

    // Continuing after a point made in an earlier chunk
    if (contextSignals.currentContinuesAfterPoint) {
      if (state === 'green') {
        state = 'yellow';
      } else if (state === 'yellow') {
        state = 'red';
      }
      contextReasonsFired.push('continuingAfterPoint');
    }

    // Chronic preamble: over-contextualizing across multiple chunks
    if (contextSignals.recentPreambleCount >= CONTEXT.chronicPreambleThreshold) {
      if (state === 'green') {
        state = 'yellow';
      }
      contextReasonsFired.push('chronicPreamble');
    }

    // Pick the most specific context reason that fired.
    // Priority: specific explanations > generic "you talked too long."
    if (contextReasonsFired.length > 0) {
      const CONTEXT_REASON_PRIORITY = [
        'continuingAfterPoint',
        'chronicPreamble',
        'sustainedMonologue',
      ];
      for (const candidate of CONTEXT_REASON_PRIORITY) {
        if (contextReasonsFired.includes(candidate)) {
          primaryReason = candidate;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: Increase severity if tone flags are present
  // Each tone flag nudges the state one level worse.
  // ------------------------------------------------------------------
  if (analysis.toneFlags.length > 0) {
    if (state === 'green') {
      state = 'yellow';
      // If the flag is 'abstract', use that as the reason
      if (analysis.toneFlags.includes('abstract')) {
        primaryReason = 'abstract';
      } else {
        primaryReason = 'toneFlags';
      }
    }
    // Multiple flags in yellow → red
    if (state === 'yellow' && analysis.toneFlags.length >= 2) {
      state = 'red';
      primaryReason = 'combined';
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Pick the coaching message
  // V2: Now passes primaryReason so the message can be context-specific.
  // ------------------------------------------------------------------
  const escalationLevel = sessionData.escalationLevel || 0;
  const message = pickMessage(state, escalationLevel, primaryReason);

  // ------------------------------------------------------------------
  // Step 5: Build the reasoning (explain WHY this state was chosen)
  // This helps the user understand the decision. Transparency is key.
  // ------------------------------------------------------------------
  const reasons = [];

  if (totalSeconds > thresholds.yellowMax) {
    reasons.push(`Speaking for ~${totalSeconds}s (over ${thresholds.yellowMax}s red threshold)`);
  } else if (totalSeconds > thresholds.greenMax) {
    reasons.push(`Speaking for ~${totalSeconds}s (over ${thresholds.greenMax}s green threshold)`);
  } else {
    reasons.push(`Speaking for ~${totalSeconds}s (within green zone)`);
  }

  if (!handedFloorBack && analysis.wordCount > minWords) {
    reasons.push('No floor handback — try inviting them to respond');
  }

  // V2 pattern reasons
  if (analysis.hasPreamblePattern) {
    reasons.push('Preamble detected — you spent the first half setting context');
  }

  if (analysis.hasPostPointRamble) {
    reasons.push('Post-point ramble — you kept going after making your point');
  }

  if (analysis.toneFlags.length > 0) {
    reasons.push(`Tone flags: ${analysis.toneFlags.join(', ')}`);
  }

  // V3 context reasons
  if (contextSignals) {
    if (contextSignals.chunksWithoutHandback >= CONTEXT.sustainedMonologueThreshold) {
      reasons.push(`Sustained monologue — ${contextSignals.chunksWithoutHandback} chunks without handing back the floor`);
    }
    if (contextSignals.currentContinuesAfterPoint) {
      reasons.push('Continuing after a point made in an earlier chunk');
    }
    if (contextSignals.recentPreambleCount >= CONTEXT.chronicPreambleThreshold) {
      reasons.push(`Chronic preamble — ${contextSignals.recentPreambleCount} of last ${contextSignals.windowSize} chunks were setup-heavy`);
    }
  }

  if (escalationLevel > 0) {
    reasons.push(`Escalation level: ${escalationLevel}`);
  }

  return {
    state,
    message,
    reasoning: reasons,
    primaryReason,
    totalSeconds,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Pick a coaching message for the given state, escalation level, and reason.
 *
 * V2: Now checks COACHING_MESSAGES.contextual[primaryReason] first.
 * If a context-specific message pool exists for the reason, use it.
 * Otherwise, fall back to the generic state-based pool (green/yellow/red).
 *
 * Cycles through the available messages so you don't see the same one
 * every time. Uses a simple counter approach.
 *
 * @param {string} state — 'green', 'yellow', or 'red'
 * @param {number} escalationLevel — 0, 1, or 2
 * @param {string} [primaryReason] — V2: why the state was chosen (optional)
 * @returns {string} The coaching message to display
 */
let messageCounters = { green: 0, yellow: 0, red: 0, escalated: 0 };

export function pickMessage(state, escalationLevel, primaryReason) {
  // If escalation is maxed out, use the escalated messages
  if (escalationLevel >= 2 && (state === 'yellow' || state === 'red')) {
    const messages = COACHING_MESSAGES.escalated;
    const index = messageCounters.escalated % messages.length;
    messageCounters.escalated++;
    return messages[index];
  }

  // V2: Try context-specific messages first.
  // If the coach knows WHY you were flagged (e.g., 'preamble'), it can
  // say "Get to the point faster" instead of a generic "wrap it up."
  if (primaryReason && state !== 'green') {
    const contextual = COACHING_MESSAGES.contextual || {};
    const contextMessages = contextual[primaryReason];
    if (contextMessages && contextMessages.length > 0) {
      // Initialize counter for this reason if needed
      if (messageCounters[primaryReason] === undefined) {
        messageCounters[primaryReason] = 0;
      }
      const index = messageCounters[primaryReason] % contextMessages.length;
      messageCounters[primaryReason]++;
      return contextMessages[index];
    }
  }

  // Fall back to generic state-based messages
  const messages = COACHING_MESSAGES[state];
  if (!messages || messages.length === 0) {
    return '';
  }

  const index = messageCounters[state] % messages.length;
  messageCounters[state]++;
  return messages[index];
}

/**
 * Reset the message counters. Used when resetting a session.
 */
export function resetMessageCounters() {
  messageCounters = { green: 0, yellow: 0, red: 0, escalated: 0 };
}
