// ============================================================================
// commands/index.js — The public API for Project STFU
// ============================================================================
// This is the ONE file that everything else talks to.
// The CLI calls these functions. The UI calls these functions.
// An AI agent calls these functions.
//
// Every function returns the same shape: { success, data, message }
// This consistency is an AFD principle — predictable, structured results
// make the system easy to use for humans, UIs, and AI agents alike.
//
// AFD PRINCIPLE: Commands are the product. This file IS the app.
// The UI is just a thin layer on top. The CLI is just a thin layer on top.
// If it can't be done through these commands, it doesn't exist.
// ============================================================================

import { whatCanIDo, getSchema } from '../logic/registry.js';
import { startSession, stopSession, resetSession, getStatus } from '../logic/session.js';
import { analyzeChunk } from '../logic/analyzer.js';
import { determineCoaching, resetMessageCounters } from '../logic/coach.js';
import { computeContext } from '../logic/context.js';
import { updateEscalation, describeEscalation } from '../logic/escalation.js';
import { generateSummary } from '../logic/summary.js';
import * as store from '../data/store.js';

// ============================================================================
// RE-EXPORT DISCOVERY COMMANDS (AFD core)
// ============================================================================

// These are the "menu" of the app. Any consumer starts here.
export { whatCanIDo, getSchema, getStatus };

// ============================================================================
// RE-EXPORT SESSION COMMANDS
// ============================================================================

export { startSession, stopSession };

/**
 * Reset the current session and clean up all internal state.
 *
 * @returns {object} AFD-style result
 */
export function reset() {
  // Reset message counters so coaching messages start fresh
  resetMessageCounters();
  return resetSession();
}

// ============================================================================
// ANALYSIS COMMANDS
// ============================================================================

/**
 * processTranscriptChunk — The main workhorse command.
 *
 * Takes a chunk of text (what you just said), analyzes it, determines
 * coaching state, handles escalation, and updates the session.
 *
 * This is the command you'll call most often during a video call.
 *
 * @param {string} text — The transcript text to analyze
 * @returns {object} AFD-style result with analysis + coaching
 */
export function processTranscriptChunk(text) {
  // Check that we have an active session
  const session = store.getSession();
  if (!session || session.status !== 'active') {
    return {
      success: false,
      data: null,
      message: 'No active session. Call startSession() first.',
    };
  }

  // Guard: text must be a non-empty string
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      success: false,
      data: null,
      message: 'Please provide some transcript text to analyze.',
    };
  }

  // ------------------------------------------------------------------
  // Step 1: Analyze the text
  // ------------------------------------------------------------------
  const analysis = analyzeChunk(text);

  // ------------------------------------------------------------------
  // Step 1.5 (V3): Compute rolling context from recent chunks
  //
  // This gives the coach a "memory" of recent chunks so it can detect
  // patterns like sustained monologuing, continuing after a prior point,
  // or chronic over-contextualizing across multiple turns.
  // ------------------------------------------------------------------
  const contextSignals = computeContext(session.chunks || [], analysis);

  // ------------------------------------------------------------------
  // Step 2: Determine coaching state (green / yellow / red)
  // V3: Now passes contextSignals so the coach can apply rolling bumps.
  // ------------------------------------------------------------------
  const coaching = determineCoaching(analysis, session, contextSignals);

  // ------------------------------------------------------------------
  // Step 3: Update escalation
  // ------------------------------------------------------------------
  const escalation = updateEscalation(
    coaching.state,
    session.escalationLevel,
    session.consecutiveWarnings
  );

  // ------------------------------------------------------------------
  // Step 4: Update the session in the store
  // ------------------------------------------------------------------
  store.updateSession({
    totalSpeakingSeconds: coaching.totalSeconds,
    coachingState: coaching.state,
    coachingMessage: coaching.message,
    escalationLevel: escalation.level,
    consecutiveWarnings: escalation.consecutiveWarnings,
  });

  // Save the chunk with its analysis data for the summary later.
  // V3: Now also stores V2 analysis fields so the rolling context module
  // can look at recent chunks and compute cross-chunk patterns.
  store.addChunk({
    text: text.trim(),
    wordCount: analysis.wordCount,
    estimatedSeconds: analysis.estimatedSeconds,
    hasQuestion: analysis.hasQuestion,
    toneFlags: analysis.toneFlags,
    coachingState: coaching.state,
    // V2 fields — needed by the context layer for rolling analysis
    hasFloorHandback: analysis.hasFloorHandback || false,
    hasPreamblePattern: analysis.hasPreamblePattern || false,
    hasPostPointRamble: analysis.hasPostPointRamble || false,
  });

  // Log the event
  store.addEvent('chunk_analyzed', {
    wordCount: analysis.wordCount,
    estimatedSeconds: analysis.estimatedSeconds,
    coachingState: coaching.state,
    escalationLevel: escalation.level,
  });

  // ------------------------------------------------------------------
  // Step 5: Build the triggered signals list for observability.
  //
  // This is an array of plain-English labels describing which detection
  // signals actually fired. It lets the CLI and UI show exactly what
  // the system noticed — useful for debugging and trust-building.
  // ------------------------------------------------------------------
  const triggeredSignals = [];

  if (analysis.hasPreamblePattern) {
    triggeredSignals.push('preamble (over-contextualizing)');
  }
  if (analysis.hasPostPointRamble) {
    triggeredSignals.push('post-point ramble');
  }
  if (analysis.toneFlags && analysis.toneFlags.length > 0) {
    analysis.toneFlags.forEach(flag => triggeredSignals.push(`tone: ${flag}`));
  }
  if (analysis.hasFloorHandback === false && analysis.wordCount > 20) {
    triggeredSignals.push('no floor handback');
  }
  if (analysis.hasQuestion) {
    triggeredSignals.push('question detected');
  }
  // V3 context signals
  if (contextSignals.chunksWithoutHandback >= 2) {
    triggeredSignals.push(`sustained monologue (${contextSignals.chunksWithoutHandback} chunks without handback)`);
  }
  if (contextSignals.currentContinuesAfterPoint) {
    triggeredSignals.push('continuing after point (cross-chunk)');
  }
  if (contextSignals.recentPreambleCount >= 2) {
    triggeredSignals.push(`chronic preamble (${contextSignals.recentPreambleCount} recent chunks)`);
  }

  // ------------------------------------------------------------------
  // Step 6: Return the result
  // ------------------------------------------------------------------
  return {
    success: true,
    data: {
      // Analysis results
      wordCount: analysis.wordCount,
      estimatedSeconds: analysis.estimatedSeconds,
      hasQuestion: analysis.hasQuestion,
      toneFlags: analysis.toneFlags,

      // V2 analysis results
      hasPreamblePattern: analysis.hasPreamblePattern || false,
      hasPostPointRamble: analysis.hasPostPointRamble || false,
      hasFloorHandback: analysis.hasFloorHandback || false,
      concreteScore: analysis.concreteScore || 0,

      // Coaching results
      coachingState: coaching.state,
      coachingMessage: coaching.message,
      reasoning: coaching.reasoning,
      primaryReason: coaching.primaryReason || 'duration',

      // Observability — which signals fired for this chunk
      triggeredSignals,

      // Escalation info
      escalationLevel: escalation.level,
      escalationDescription: describeEscalation(escalation.level),

      // V3 rolling context signals
      contextSignals,

      // Session totals
      totalSpeakingSeconds: coaching.totalSeconds,
    },
    message: `Chunk analyzed: ${coaching.state.toUpperCase()} — ${coaching.message}`,
  };
}

// ============================================================================
// COACHING COMMANDS
// ============================================================================

/**
 * getCurrentCoachingMessage — Get the current coaching state without
 * analyzing new text.
 *
 * Useful for checking where you stand mid-conversation.
 *
 * @returns {object} AFD-style result with current coaching state and message
 */
export function getCurrentCoachingMessage() {
  const session = store.getSession();

  if (!session) {
    return {
      success: true,
      data: {
        state: 'idle',
        message: 'No active session.',
        escalationLevel: 0,
      },
      message: 'No active session.',
    };
  }

  return {
    success: true,
    data: {
      state: session.coachingState,
      message: session.coachingMessage,
      escalationLevel: session.escalationLevel,
      escalationDescription: describeEscalation(session.escalationLevel),
      totalSpeakingSeconds: session.totalSpeakingSeconds,
    },
    message: session.coachingMessage || 'No coaching message yet. Submit a transcript chunk first.',
  };
}

/**
 * updateThresholds — Change the timing thresholds for the current session.
 *
 * This lets you make the coach more or less strict.
 * For example: { greenMax: 30 } makes the green zone shorter (stricter).
 *
 * @param {object} config — Threshold values to update
 * @returns {object} AFD-style result with updated thresholds
 */
export function updateThresholds(config) {
  const session = store.getSession();

  if (!session) {
    return {
      success: false,
      data: null,
      message: 'No active session. Start a session first, then update thresholds.',
    };
  }

  if (!config || typeof config !== 'object') {
    return {
      success: false,
      data: null,
      message: 'Please provide a config object. Example: { greenMax: 30, yellowMax: 60 }',
    };
  }

  // Merge new config into existing thresholds
  const updatedThresholds = { ...session.thresholds, ...config };
  store.updateSession({ thresholds: updatedThresholds });
  store.addEvent('thresholds_updated', { config });

  return {
    success: true,
    data: updatedThresholds,
    message: 'Thresholds updated.',
  };
}

// ============================================================================
// SUMMARY COMMANDS
// ============================================================================

/**
 * getSessionSummary — Generate a summary of the current or stopped session.
 *
 * @returns {object} AFD-style result with the summary
 */
export function getSessionSummary() {
  const session = store.getSession();

  if (!session) {
    return {
      success: false,
      data: null,
      message: 'No session to summarize. Start and complete a session first.',
    };
  }

  return generateSummary(session);
}
