// ============================================================================
// app.js — Browser-side JavaScript for Project STFU UI
// ============================================================================
// This file runs in the browser. It talks to the server API
// (which calls the same command layer as the CLI).
//
// AFD PRINCIPLE: The UI is a thin client. All logic lives on the server.
// This file only handles:
//   1. Sending API requests
//   2. Updating the DOM with results
//   3. Managing the timer display
// ============================================================================

// ============================================================================
// STATE — What the browser needs to track
// ============================================================================

// Timer interval reference (so we can stop it)
let timerInterval = null;

// When the session started (for the timer display)
let sessionStartTime = null;

// ============================================================================
// API HELPER — Talk to the server
// ============================================================================

/**
 * Call a server API command.
 *
 * Every command goes to POST /api/<commandName> with a JSON body.
 * Every response comes back as { success, data, message }.
 *
 * @param {string} command — The command name (e.g., 'startSession')
 * @param {object} body — The request body (optional)
 * @returns {object} The API response
 */
async function api(command, body = {}) {
  try {
    const response = await fetch(`/api/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch (err) {
    return { success: false, message: `Network error: ${err.message}` };
  }
}

// ============================================================================
// DOM REFERENCES — Grab elements once
// ============================================================================

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const btnAnalyze = document.getElementById('btn-analyze');
const transcriptInput = document.getElementById('transcript-input');
const timerDisplay = document.getElementById('timer');
const statusBadge = document.getElementById('status-badge');
const coachingMessage = document.getElementById('coaching-message');
const reasoningDiv = document.getElementById('reasoning');
const eventLog = document.getElementById('event-log');
const summaryPanel = document.getElementById('summary-panel');

// Debug / explanation panel elements
const debugPrimaryReason = document.getElementById('debug-primary-reason');
const debugEscalation = document.getElementById('debug-escalation');
const debugSignals = document.getElementById('debug-signals');
const debugReasoning = document.getElementById('debug-reasoning');
const debugStats = document.getElementById('debug-stats');
const debugContext = document.getElementById('debug-context');

// ============================================================================
// BUTTON HANDLERS — What happens when you click things
// ============================================================================

/**
 * Start a new session.
 */
async function handleStart() {
  const result = await api('startSession');

  if (result.success) {
    // Enable the UI
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnReset.disabled = false;
    btnAnalyze.disabled = false;
    transcriptInput.disabled = false;

    // Start the timer
    sessionStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    // Update status
    updateBadge('green', 'Session started. Paste transcript chunks and hit Analyze.');

    // Log it
    addLogEntry('Session started', 'info');
  } else {
    addLogEntry(`Failed to start: ${result.message}`, 'red');
  }
}

/**
 * Stop the current session.
 */
async function handleStop() {
  const result = await api('stopSession');

  if (result.success) {
    // Disable input controls
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnReset.disabled = false;
    btnAnalyze.disabled = true;
    transcriptInput.disabled = true;

    // Stop the timer
    clearInterval(timerInterval);
    timerInterval = null;

    // Update status
    updateBadge('idle', 'Session stopped and saved.');
    addLogEntry('Session stopped', 'info');

    // Fetch and show the summary
    await loadSummary();
  } else {
    addLogEntry(`Failed to stop: ${result.message}`, 'red');
  }
}

/**
 * Reset the current session.
 */
async function handleReset() {
  const result = await api('resetSession');

  if (result.success) {
    // Reset all UI
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnReset.disabled = true;
    btnAnalyze.disabled = true;
    transcriptInput.disabled = true;
    transcriptInput.value = '';

    // Stop and reset timer
    clearInterval(timerInterval);
    timerInterval = null;
    sessionStartTime = null;
    timerDisplay.textContent = '00:00';

    // Reset status
    updateBadge('idle', 'Session reset. Start a new one whenever you\'re ready.');
    reasoningDiv.innerHTML = '';
    clearDebugPanel();

    addLogEntry('Session reset', 'info');
  } else {
    addLogEntry(`Failed to reset: ${result.message}`, 'red');
  }
}

/**
 * Analyze the transcript text.
 */
async function handleAnalyze() {
  const text = transcriptInput.value.trim();

  if (!text) {
    addLogEntry('No text to analyze. Paste something first.', 'yellow');
    return;
  }

  const result = await api('processTranscriptChunk', { text });

  if (result.success) {
    const d = result.data;

    // Update the coaching badge
    updateBadge(d.coachingState, d.coachingMessage);

    // Show reasoning below the badge (kept for backward compat)
    if (d.reasoning && d.reasoning.length > 0) {
      reasoningDiv.innerHTML = d.reasoning
        .map(r => `<p>• ${r}</p>`)
        .join('');
    }

    // ----- Populate the debug / explanation panel -----
    updateDebugPanel(d);

    // Log the event
    const toneStr = d.toneFlags.length > 0 ? ` [${d.toneFlags.join(', ')}]` : '';
    addLogEntry(
      `Analyzed: ${d.wordCount} words, ~${d.estimatedSeconds}s, ${d.coachingState.toUpperCase()}${toneStr}`,
      d.coachingState
    );

    // Clear the input for the next chunk
    transcriptInput.value = '';
    transcriptInput.focus();
  } else {
    addLogEntry(`Analysis failed: ${result.message}`, 'red');
  }
}

// ============================================================================
// UI UPDATERS
// ============================================================================

/**
 * Update the status badge and coaching message.
 */
function updateBadge(state, message) {
  // Remove all badge classes
  statusBadge.className = 'badge';

  // Add the right class
  statusBadge.classList.add(`badge-${state}`);
  statusBadge.textContent = state.toUpperCase();

  // Update the coaching message
  coachingMessage.textContent = message || '';
}

/**
 * Populate the debug / explanation panel with the full coaching breakdown.
 *
 * This is the observability heart of the UI. It shows:
 *   - Why the state was chosen (primaryReason)
 *   - Current escalation level
 *   - Which detection signals actually fired
 *   - The step-by-step reasoning chain from the coach
 *   - Raw analysis stats (words, seconds, booleans)
 *
 * @param {object} d — The data object from processTranscriptChunk
 */
function updateDebugPanel(d) {
  // Primary reason — the single most important "why"
  debugPrimaryReason.textContent = d.primaryReason || 'duration';

  // Escalation — level number + human description
  debugEscalation.textContent = `Level ${d.escalationLevel} — ${d.escalationDescription}`;

  // Triggered signals — one per line, or "(none)" if clean
  if (d.triggeredSignals && d.triggeredSignals.length > 0) {
    debugSignals.textContent = d.triggeredSignals.map(s => `▸ ${s}`).join('\n');
  } else {
    debugSignals.textContent = '(none)';
  }

  // Reasoning — the full chain of logic from the coach
  if (d.reasoning && d.reasoning.length > 0) {
    debugReasoning.textContent = d.reasoning.map(r => `• ${r}`).join('\n');
  } else {
    debugReasoning.textContent = '(none)';
  }

  // Stats — compact one-liner with key numbers
  const parts = [
    `${d.wordCount} words`,
    `~${d.estimatedSeconds}s chunk`,
    `~${d.totalSpeakingSeconds}s total`,
    d.hasQuestion ? 'question: yes' : 'question: no',
    d.hasFloorHandback ? 'handback: yes' : 'handback: no',
    d.hasPreamblePattern ? 'preamble: yes' : 'preamble: no',
    d.hasPostPointRamble ? 'post-point: yes' : 'post-point: no',
    `concrete: ${d.concreteScore}`,
    d.toneFlags.length > 0 ? `tone: ${d.toneFlags.join(', ')}` : 'tone: clean',
  ];
  debugStats.textContent = parts.join('\n');

  // Rolling context — cross-chunk signals from the context layer
  if (d.contextSignals) {
    const ctx = d.contextSignals;
    const ctxParts = [
      `window: ${ctx.windowSize} chunks`,
      `recent speaking: ~${ctx.recentSpeakingSeconds}s`,
      `no handback streak: ${ctx.chunksWithoutHandback}`,
      ctx.pointMadeInRecentChunk ? 'prior point: yes' : 'prior point: no',
      ctx.currentContinuesAfterPoint ? 'continues point: yes' : 'continues point: no',
      `recent preamble: ${ctx.recentPreambleCount}`,
    ];
    debugContext.textContent = ctxParts.join('\n');
  } else {
    debugContext.textContent = '(no context yet)';
  }
}

/**
 * Reset the debug panel to its empty state.
 */
function clearDebugPanel() {
  debugPrimaryReason.textContent = '—';
  debugEscalation.textContent = '—';
  debugSignals.textContent = '—';
  debugReasoning.textContent = '—';
  debugStats.textContent = '—';
  debugContext.textContent = '—';
}

/**
 * Add an entry to the event log.
 */
function addLogEntry(text, level = 'info') {
  // Remove the placeholder if it's there
  const placeholder = eventLog.querySelector('.muted');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('p');
  entry.className = `log-entry log-${level}`;

  // Add timestamp
  const now = new Date().toLocaleTimeString();
  entry.textContent = `[${now}] ${text}`;

  // Add to the top (newest first)
  eventLog.prepend(entry);
}

/**
 * Update the session timer display.
 */
function updateTimer() {
  if (!sessionStartTime) return;

  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${minutes}:${seconds}`;
}

/**
 * Load and display the session summary.
 */
async function loadSummary() {
  const result = await api('getSessionSummary');

  if (result.success && result.data) {
    summaryPanel.textContent = result.data.textSummary;
  } else {
    summaryPanel.textContent = 'No summary available.';
  }
}

// ============================================================================
// KEYBOARD SHORTCUT — Press Enter in the textarea to analyze
// ============================================================================

transcriptInput.addEventListener('keydown', (e) => {
  // Ctrl+Enter or Cmd+Enter to analyze
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleAnalyze();
  }
});
