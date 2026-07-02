// ============================================================================
// store.js — Data storage for Project STFU
// ============================================================================
// This is the "database" of the app. It stores session data in memory
// while the app is running, and saves session history to JSON files
// on your computer so you can look back at past sessions.
//
// AFD PRINCIPLE: The data layer knows nothing about business logic.
// It just stores and retrieves data. The logic layer tells it what
// to save; it never decides on its own.
// ============================================================================

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --------------------------------------------------------------------------
// Figure out where to save session files.
// __dirname doesn't exist in ES modules, so we compute it manually.
// --------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_DIR = path.join(__dirname, '..', '..', 'data', 'sessions');

// ============================================================================
// IN-MEMORY STORE
// ============================================================================
// This holds the current session while the app is running.
// When you close the app, this data disappears — but we save it
// to a file first (see saveSession below).
// ============================================================================

/**
 * The current session object. Starts as null (no session).
 * When you call createSession(), this gets filled in.
 *
 * Shape of a session:
 * {
 *   id:              string    — unique ID like "session-1710000000000"
 *   status:          string    — 'active', 'stopped', or 'idle'
 *   startedAt:       string    — ISO timestamp when session started
 *   stoppedAt:       string|null — ISO timestamp when session stopped
 *   chunks:          array     — list of transcript chunks submitted
 *   events:          array     — log of everything that happened
 *   coachingState:   string    — 'green', 'yellow', or 'red'
 *   coachingMessage: string    — current coaching message to show
 *   escalationLevel: number    — 0, 1, or 2 (how urgent warnings are)
 *   consecutiveWarnings: number — how many yellow/red in a row
 *   totalSpeakingSeconds: number — estimated total speaking time
 *   thresholds:      object    — current threshold config
 * }
 */
let currentSession = null;

// ============================================================================
// PUBLIC FUNCTIONS — These are what the logic layer calls
// ============================================================================

/**
 * Create a new session and store it in memory.
 *
 * @param {object} thresholds — The threshold config to use for this session
 * @returns {object} The new session object
 */
export function createSession(thresholds) {
  const id = `session-${Date.now()}`;

  currentSession = {
    id,
    status: 'active',
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    chunks: [],
    events: [],
    coachingState: 'green',
    coachingMessage: '',
    escalationLevel: 0,
    consecutiveWarnings: 0,
    totalSpeakingSeconds: 0,
    thresholds: { ...thresholds },
  };

  // Log the creation event
  addEvent('session_started', { id });

  return { ...currentSession };
}

/**
 * Get the current session. Returns null if no session exists.
 *
 * @returns {object|null} A copy of the current session, or null
 */
export function getSession() {
  if (!currentSession) return null;
  return { ...currentSession };
}

/**
 * Update specific fields on the current session.
 * This is how the logic layer modifies session state.
 *
 * @param {object} updates — An object with the fields to change
 * @returns {object} The updated session
 */
export function updateSession(updates) {
  if (!currentSession) {
    throw new Error('No active session. Call createSession() first.');
  }

  // Merge the updates into the current session
  Object.assign(currentSession, updates);

  return { ...currentSession };
}

/**
 * Add a transcript chunk to the current session's history.
 *
 * @param {object} chunkData — The analyzed chunk data to store
 */
export function addChunk(chunkData) {
  if (!currentSession) {
    throw new Error('No active session. Call createSession() first.');
  }
  currentSession.chunks.push({
    ...chunkData,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Add an event to the session's event log.
 * Events are a timeline of everything that happened during the session.
 *
 * @param {string} type — The event type (e.g., 'session_started', 'chunk_analyzed')
 * @param {object} detail — Extra info about the event
 */
export function addEvent(type, detail = {}) {
  if (!currentSession) return;
  currentSession.events.push({
    type,
    detail,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Clear the current session from memory.
 * Call this when resetting. The session data is gone unless you saved it first.
 */
export function clearSession() {
  currentSession = null;
}

// ============================================================================
// FILE PERSISTENCE — Save and load sessions as JSON files
// ============================================================================

/**
 * Save the current session to a JSON file in data/sessions/.
 * This is called when you stop a session so you have a record of it.
 *
 * @returns {string} The file path where the session was saved
 */
export async function saveSession() {
  if (!currentSession) {
    throw new Error('No session to save.');
  }

  // Make sure the sessions directory exists
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
  }

  const filePath = path.join(SESSIONS_DIR, `${currentSession.id}.json`);
  const data = JSON.stringify(currentSession, null, 2);
  await writeFile(filePath, data, 'utf-8');

  return filePath;
}

/**
 * Load a saved session from a JSON file.
 *
 * @param {string} sessionId — The session ID (e.g., "session-1710000000000")
 * @returns {object|null} The session data, or null if not found
 */
export async function loadSession(sessionId) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);

  if (!existsSync(filePath)) {
    return null;
  }

  const data = await readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * List all saved session IDs.
 *
 * @returns {string[]} Array of session IDs
 */
export async function listSessions() {
  if (!existsSync(SESSIONS_DIR)) {
    return [];
  }

  const { readdir } = await import('node:fs/promises');
  const files = await readdir(SESSIONS_DIR);

  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
