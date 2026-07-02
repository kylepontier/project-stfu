// ============================================================================
// session.js — Session management for Project STFU
// ============================================================================
// A "session" represents one video call (or practice round).
// You start a session, submit transcript chunks during the call,
// and stop the session when the call is over.
//
// This module handles the lifecycle: start, stop, reset.
// It does NOT handle analysis — that's the analyzer's job.
//
// AFD PRINCIPLE: Each module has one clear responsibility.
// Session management is separate from analysis, coaching, etc.
// ============================================================================

import * as store from '../data/store.js';
import { THRESHOLDS } from '../data/defaults.js';

/**
 * Start a new session.
 *
 * This creates a fresh session in the store and returns it.
 * If a session is already active, it returns an error result.
 *
 * @param {object} [customThresholds] — Optional custom thresholds to override defaults
 * @returns {object} AFD-style result: { success, data, message }
 */
export function startSession(customThresholds = null) {
  // Check if there's already an active session
  const existing = store.getSession();
  if (existing && existing.status === 'active') {
    return {
      success: false,
      data: null,
      message: 'A session is already active. Stop or reset it first.',
    };
  }

  // Merge custom thresholds with defaults (custom wins if provided)
  const thresholds = customThresholds
    ? { ...THRESHOLDS, ...customThresholds }
    : { ...THRESHOLDS };

  // Create the session in the store
  const session = store.createSession(thresholds);

  return {
    success: true,
    data: session,
    message: `Session ${session.id} started.`,
  };
}

/**
 * Stop the current session.
 *
 * This marks the session as stopped and saves it to a file.
 * Once stopped, you can still view the session but can't add new chunks.
 *
 * @returns {object} AFD-style result: { success, data, message }
 */
export async function stopSession() {
  const session = store.getSession();

  if (!session) {
    return {
      success: false,
      data: null,
      message: 'No session to stop. Start one first.',
    };
  }

  if (session.status === 'stopped') {
    return {
      success: false,
      data: null,
      message: 'Session is already stopped.',
    };
  }

  // Mark it as stopped
  store.updateSession({
    status: 'stopped',
    stoppedAt: new Date().toISOString(),
  });
  store.addEvent('session_stopped', {});

  // Save to file for history
  const filePath = await store.saveSession();

  const updated = store.getSession();
  return {
    success: true,
    data: updated,
    message: `Session stopped and saved to ${filePath}.`,
  };
}

/**
 * Reset the current session.
 *
 * This wipes the current session from memory entirely.
 * If the session was active, it's gone — not saved.
 * Use stopSession() first if you want to keep the data.
 *
 * @returns {object} AFD-style result: { success, data, message }
 */
export function resetSession() {
  const session = store.getSession();

  if (!session) {
    return {
      success: false,
      data: null,
      message: 'No session to reset.',
    };
  }

  store.addEvent('session_reset', {});
  store.clearSession();

  return {
    success: true,
    data: null,
    message: 'Session has been reset. Start a new one whenever you\'re ready.',
  };
}

/**
 * Get the current session status.
 *
 * AFD PRINCIPLE: getStatus() is a core discovery function.
 * Any agent or UI can call this to understand the current state.
 *
 * @returns {object} AFD-style result with session status info
 */
export function getStatus() {
  const session = store.getSession();

  if (!session) {
    return {
      success: true,
      data: {
        hasActiveSession: false,
        status: 'idle',
        message: 'No active session. Call startSession() to begin.',
      },
      message: 'No active session.',
    };
  }

  return {
    success: true,
    data: {
      hasActiveSession: session.status === 'active',
      status: session.status,
      sessionId: session.id,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      chunksProcessed: session.chunks.length,
      totalSpeakingSeconds: session.totalSpeakingSeconds,
      coachingState: session.coachingState,
      coachingMessage: session.coachingMessage,
      escalationLevel: session.escalationLevel,
    },
    message: `Session ${session.id} is ${session.status}.`,
  };
}
