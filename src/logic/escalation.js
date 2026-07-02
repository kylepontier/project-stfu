// ============================================================================
// escalation.js — Warning escalation logic for Project STFU
// ============================================================================
// When you keep hitting yellow or red across multiple chunks,
// the escalation system makes warnings more urgent.
//
// Think of it like this:
//   - First time you go yellow → gentle nudge
//   - Second time in a row → stronger warning
//   - Third time in a row → urgent "STOP" message
//
// The escalation level resets when you go back to green
// (meaning you paused, asked a question, or let others talk).
//
// AFD PRINCIPLE: Single responsibility. This module only handles
// escalation math. It doesn't pick messages or analyze text.
// ============================================================================

import { ESCALATION } from '../data/defaults.js';

/**
 * Update escalation based on the new coaching state.
 *
 * Rules:
 * - If the state is green → reset consecutive warnings to 0, de-escalate by 1
 * - If the state is yellow or red → increment consecutive warnings
 * - If consecutive warnings >= threshold → escalate (up to max level)
 *
 * @param {string} newState — The coaching state just determined ('green', 'yellow', 'red')
 * @param {number} currentLevel — The current escalation level (0, 1, or 2)
 * @param {number} consecutiveWarnings — How many consecutive yellow/red chunks
 * @returns {object} Updated escalation info: { level, consecutiveWarnings, changed }
 */
export function updateEscalation(newState, currentLevel, consecutiveWarnings) {
  let level = currentLevel;
  let warnings = consecutiveWarnings;
  let changed = false;

  if (newState === 'green') {
    // Good news — you pulled back. Reset warning count.
    warnings = 0;

    // De-escalate by one level (don't go below 0)
    if (level > 0) {
      level = level - 1;
      changed = true;
    }
  } else {
    // Yellow or red — another warning in a row
    warnings = warnings + 1;

    // Check if we should escalate
    if (warnings >= ESCALATION.warningsBeforeEscalate && level < ESCALATION.maxLevel) {
      level = level + 1;
      warnings = 0; // Reset counter after escalating
      changed = true;
    }
  }

  return {
    level,
    consecutiveWarnings: warnings,
    changed,
  };
}

/**
 * Get a human-readable description of the current escalation level.
 *
 * @param {number} level — Escalation level (0, 1, or 2)
 * @returns {string} Description
 */
export function describeEscalation(level) {
  switch (level) {
    case 0: return 'Normal — no escalation';
    case 1: return 'Elevated — you\'ve been warned multiple times';
    case 2: return 'Urgent — repeated pattern detected, strong warnings active';
    default: return 'Unknown escalation level';
  }
}
