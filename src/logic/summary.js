// ============================================================================
// summary.js — Session summary generator for Project STFU
// ============================================================================
// After a session ends, this module creates a human-readable summary
// of how it went. Think of it as your "game tape review."
//
// It looks at all the chunks, coaching states, and events from the session
// and produces a summary like:
//   "You spoke for about 5 minutes across 8 chunks.
//    You hit yellow 3 times and red once.
//    You asked 2 questions.
//    Tip: Try to ask more questions to keep the conversation balanced."
//
// AFD PRINCIPLE: This module reads session data and produces output.
// It doesn't modify any data — it's a pure read/compute operation.
// ============================================================================

/**
 * Generate a summary for a completed session.
 *
 * @param {object} session — The full session object (from store or loaded from file)
 * @returns {object} AFD-style result: { success, data, message }
 */
export function generateSummary(session) {
  if (!session) {
    return {
      success: false,
      data: null,
      message: 'No session provided.',
    };
  }

  const chunks = session.chunks || [];
  const events = session.events || [];

  // ------------------------------------------------------------------
  // Calculate basic stats
  // ------------------------------------------------------------------

  // Total speaking time (sum of all chunk estimated seconds)
  const totalSeconds = chunks.reduce(
    (sum, chunk) => sum + (chunk.estimatedSeconds || 0),
    0
  );

  // Total word count
  const totalWords = chunks.reduce(
    (sum, chunk) => sum + (chunk.wordCount || 0),
    0
  );

  // How many chunks hit each coaching state
  const stateCounts = { green: 0, yellow: 0, red: 0 };
  for (const chunk of chunks) {
    const state = chunk.coachingState || 'green';
    if (stateCounts[state] !== undefined) {
      stateCounts[state]++;
    }
  }

  // How many chunks contained questions
  const questionCount = chunks.filter(c => c.hasQuestion).length;

  // All unique tone flags that appeared
  const allToneFlags = new Set();
  for (const chunk of chunks) {
    if (chunk.toneFlags) {
      chunk.toneFlags.forEach(flag => allToneFlags.add(flag));
    }
  }

  // Session duration (wall clock time, not speaking time)
  let sessionDurationMinutes = 0;
  if (session.startedAt && session.stoppedAt) {
    const start = new Date(session.startedAt);
    const end = new Date(session.stoppedAt);
    sessionDurationMinutes = Math.round((end - start) / 60000);
  }

  // ------------------------------------------------------------------
  // Generate tips based on what happened
  // ------------------------------------------------------------------
  const tips = [];

  if (stateCounts.red > 0) {
    tips.push('You hit red alert — practice shorter responses next time.');
  }

  if (questionCount === 0 && chunks.length > 0) {
    tips.push('You didn\'t ask any questions. Try to engage others more.');
  } else if (questionCount < chunks.length * 0.3) {
    tips.push('You asked few questions relative to how much you spoke. Aim for more engagement.');
  }

  if (allToneFlags.has('over-explanatory')) {
    tips.push('Your language was flagged as over-explanatory. Try being more concise.');
  }

  if (allToneFlags.has('defensive')) {
    tips.push('Defensive language was detected. Try responding with curiosity instead.');
  }

  if (allToneFlags.has('abstract')) {
    tips.push('Your language was flagged as abstract. Try using concrete examples.');
  }

  if (stateCounts.green === chunks.length && chunks.length > 0) {
    tips.push('Great job! You stayed in the green zone the entire session.');
  }

  if (tips.length === 0) {
    tips.push('Decent session overall. Keep practicing awareness of your speaking time.');
  }

  // ------------------------------------------------------------------
  // Build the summary
  // ------------------------------------------------------------------
  const speakingMinutes = Math.floor(totalSeconds / 60);
  const speakingRemainderSeconds = totalSeconds % 60;

  const summary = {
    sessionId: session.id,
    sessionDurationMinutes,
    totalChunks: chunks.length,
    totalWords,
    totalSpeakingTime: `${speakingMinutes}m ${speakingRemainderSeconds}s`,
    totalSpeakingSeconds: totalSeconds,
    stateCounts,
    questionCount,
    toneFlags: Array.from(allToneFlags),
    maxEscalationLevel: session.escalationLevel || 0,
    tips,
  };

  // Build a human-readable text version
  const lines = [
    `=== Session Summary: ${session.id} ===`,
    ``,
    `Duration: ${sessionDurationMinutes} minutes`,
    `Transcript chunks analyzed: ${chunks.length}`,
    `Total words spoken: ${totalWords}`,
    `Estimated speaking time: ${speakingMinutes}m ${speakingRemainderSeconds}s`,
    ``,
    `Coaching states hit:`,
    `  Green:  ${stateCounts.green}`,
    `  Yellow: ${stateCounts.yellow}`,
    `  Red:    ${stateCounts.red}`,
    ``,
    `Questions asked: ${questionCount}`,
    `Tone flags triggered: ${allToneFlags.size > 0 ? Array.from(allToneFlags).join(', ') : 'none'}`,
    `Max escalation level: ${session.escalationLevel || 0}`,
    ``,
    `Tips:`,
    ...tips.map(t => `  - ${t}`),
  ];

  return {
    success: true,
    data: {
      ...summary,
      textSummary: lines.join('\n'),
    },
    message: 'Session summary generated.',
  };
}
