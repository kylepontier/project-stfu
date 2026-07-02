// ============================================================================
// coach.test.js — Tests for the coaching engine
// ============================================================================
// Tests that the coach correctly assigns green/yellow/red states
// based on speaking duration, question presence, and tone flags.
//
// HOW TO RUN: node --test tests/coach.test.js
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { determineCoaching, resetMessageCounters } from '../src/logic/coach.js';

// Reset message counters before each test so results are predictable
beforeEach(() => {
  resetMessageCounters();
});

/**
 * Helper: create a fake session object for testing.
 * This simulates what the store would hold.
 */
function fakeSession(overrides = {}) {
  return {
    totalSpeakingSeconds: 0,
    escalationLevel: 0,
    thresholds: { greenMax: 45, yellowMax: 90 },
    ...overrides,
  };
}

/**
 * Helper: create a fake analysis object for testing.
 * This simulates what the analyzer would return.
 */
function fakeAnalysis(overrides = {}) {
  return {
    wordCount: 25,
    estimatedSeconds: 10,
    hasQuestion: true,
    toneFlags: [],
    ...overrides,
  };
}

// ============================================================================
// GREEN ZONE — Short, healthy speaking
// ============================================================================

describe('Coach — Green zone', () => {
  it('should return green for short speech with a question', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({ estimatedSeconds: 10, hasQuestion: true });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'green');
  });

  it('should return green for speech under 45 seconds', () => {
    const session = fakeSession({ totalSpeakingSeconds: 20 });
    const analysis = fakeAnalysis({ estimatedSeconds: 10, hasQuestion: true });
    const result = determineCoaching(analysis, session);
    // Total = 30s, under greenMax of 45
    assert.equal(result.state, 'green');
  });
});

// ============================================================================
// YELLOW ZONE — Getting long
// ============================================================================

describe('Coach — Yellow zone', () => {
  it('should return yellow when total exceeds greenMax', () => {
    const session = fakeSession({ totalSpeakingSeconds: 40 });
    const analysis = fakeAnalysis({ estimatedSeconds: 10, hasQuestion: true });
    const result = determineCoaching(analysis, session);
    // Total = 50s, over greenMax of 45
    assert.equal(result.state, 'yellow');
  });

  it('should return yellow when approaching green limit without a question', () => {
    // Near the green limit (70% of 45 = 31.5) and no question → bump to yellow
    const session = fakeSession({ totalSpeakingSeconds: 25 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      wordCount: 25,
    });
    const result = determineCoaching(analysis, session);
    // Total = 35s, which is > 31.5 (70% of 45), no question → yellow
    assert.equal(result.state, 'yellow');
  });

  it('should bump green to yellow when tone flags are present', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      toneFlags: ['over-explanatory'],
    });
    const result = determineCoaching(analysis, session);
    // Would be green but tone flag bumps to yellow
    assert.equal(result.state, 'yellow');
  });
});

// ============================================================================
// RED ZONE — Wrap it up!
// ============================================================================

describe('Coach — Red zone', () => {
  it('should return red when total exceeds yellowMax', () => {
    const session = fakeSession({ totalSpeakingSeconds: 80 });
    const analysis = fakeAnalysis({ estimatedSeconds: 15, hasQuestion: true });
    const result = determineCoaching(analysis, session);
    // Total = 95s, over yellowMax of 90
    assert.equal(result.state, 'red');
  });

  it('should bump yellow to red when no question detected', () => {
    const session = fakeSession({ totalSpeakingSeconds: 40 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      wordCount: 25,
    });
    const result = determineCoaching(analysis, session);
    // Total = 50s → yellow, but no question → bumps to red
    assert.equal(result.state, 'red');
  });

  it('should bump yellow to red when multiple tone flags present', () => {
    const session = fakeSession({ totalSpeakingSeconds: 40 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      toneFlags: ['over-explanatory', 'abstract'],
    });
    const result = determineCoaching(analysis, session);
    // Total = 50s → yellow, but 2 tone flags → bumps to red
    assert.equal(result.state, 'red');
  });
});

// ============================================================================
// REASONING — Coach should explain its decisions
// ============================================================================

describe('Coach — Reasoning', () => {
  it('should include reasoning array', () => {
    const session = fakeSession();
    const analysis = fakeAnalysis({ estimatedSeconds: 10 });
    const result = determineCoaching(analysis, session);
    assert.ok(Array.isArray(result.reasoning));
    assert.ok(result.reasoning.length > 0);
  });

  it('should mention tone flags in reasoning', () => {
    const session = fakeSession();
    const analysis = fakeAnalysis({ toneFlags: ['defensive'] });
    const result = determineCoaching(analysis, session);
    const hasToneReason = result.reasoning.some(r => r.includes('defensive'));
    assert.ok(hasToneReason, 'Reasoning should mention the defensive tone flag');
  });
});

// ============================================================================
// V2: PREAMBLE AND POST-POINT RAMBLE BUMPS
// ============================================================================

describe('Coach V2 — Pattern-based bumps', () => {
  it('should bump green to yellow when preamble pattern detected', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      hasPreamblePattern: true,
      preambleScore: 3,
    });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'yellow');
    assert.equal(result.primaryReason, 'preamble');
  });

  it('should bump green to yellow when post-point ramble detected', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      hasPostPointRamble: true,
      postPointScore: 2,
    });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'yellow');
    assert.equal(result.primaryReason, 'postPointRamble');
  });

  it('should bump yellow to red when BOTH preamble and post-point detected', () => {
    const session = fakeSession({ totalSpeakingSeconds: 40 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      hasPreamblePattern: true,
      hasPostPointRamble: true,
    });
    const result = determineCoaching(analysis, session);
    // Total = 50s → yellow (duration), then both patterns → red
    assert.equal(result.state, 'red');
    assert.equal(result.primaryReason, 'combined');
  });

  it('should not fire pattern bumps when V2 fields are absent (backward compat)', () => {
    // Old-style analysis without V2 fields — should behave exactly like V1
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      // No hasPreamblePattern, no hasPostPointRamble
    });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'green');
  });
});

// ============================================================================
// V2: FLOOR HANDBACK (upgraded question check)
// ============================================================================

describe('Coach V2 — Floor handback', () => {
  it('should use hasFloorHandback instead of hasQuestion when available', () => {
    // hasQuestion is true (rhetorical "right?"), but hasFloorHandback is false
    const session = fakeSession({ totalSpeakingSeconds: 30 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 5,
      hasQuestion: true,           // old: would stay green
      hasFloorHandback: false,     // V2: no genuine handback → bump
      wordCount: 25,
    });
    const result = determineCoaching(analysis, session);
    // Total = 35s, > 31.5 (70% of 45), no floor handback → yellow
    assert.equal(result.state, 'yellow');
    assert.equal(result.primaryReason, 'noFloorHandback');
  });

  it('should stay green when hasFloorHandback is true', () => {
    const session = fakeSession({ totalSpeakingSeconds: 30 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 5,
      hasQuestion: true,
      hasFloorHandback: true,
      wordCount: 25,
    });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'green');
  });

  it('should fall back to hasQuestion when hasFloorHandback is undefined', () => {
    // Simulates a V1-style analysis object
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      // hasFloorHandback not set → falls back to hasQuestion
    });
    const result = determineCoaching(analysis, session);
    assert.equal(result.state, 'green');
  });
});

// ============================================================================
// V2: CONTEXT-AWARE MESSAGES
// ============================================================================

describe('Coach V2 — Context-aware messages', () => {
  it('should pick contextual message for preamble-triggered yellow', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      hasPreamblePattern: true,
    });
    const result = determineCoaching(analysis, session);
    // The message should come from the contextual.preamble pool
    assert.ok(
      result.message.toLowerCase().includes('point') ||
      result.message.toLowerCase().includes('context'),
      `Expected preamble-specific message, got: "${result.message}"`
    );
  });

  it('should pick contextual message for noFloorHandback', () => {
    const session = fakeSession({ totalSpeakingSeconds: 30 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 5,
      hasQuestion: false,
      hasFloorHandback: false,
      wordCount: 25,
    });
    const result = determineCoaching(analysis, session);
    // Should get a noFloorHandback contextual message
    assert.ok(
      result.message.toLowerCase().includes('respond') ||
      result.message.toLowerCase().includes('floor') ||
      result.message.toLowerCase().includes('question'),
      `Expected floor handback message, got: "${result.message}"`
    );
  });

  it('should fall back to generic message when no contextual pool matches', () => {
    // Duration-only yellow — 'duration' has no contextual pool
    const session = fakeSession({ totalSpeakingSeconds: 40 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,
      hasFloorHandback: true,
    });
    const result = determineCoaching(analysis, session);
    // Should get a generic yellow message (no contextual pool for 'duration')
    assert.ok(result.message.length > 0, 'Should still have a message');
    assert.equal(result.state, 'yellow');
  });

  it('should include primaryReason in return value', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({ estimatedSeconds: 10 });
    const result = determineCoaching(analysis, session);
    assert.ok(result.primaryReason, 'Should have a primaryReason');
    assert.equal(typeof result.primaryReason, 'string');
  });
});

// ============================================================================
// V3: CONTEXT REASON PRIORITY — specific reasons beat generic ones
// ============================================================================

describe('Coach V3 — Context reason priority', () => {
  it('should prefer continuingAfterPoint over sustainedMonologue', () => {
    // Both sustainedMonologue and continuingAfterPoint fire simultaneously.
    // continuingAfterPoint should win because it's more specific.
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      hasFloorHandback: false,
      wordCount: 25,
    });
    const contextSignals = {
      windowSize: 3,
      recentSpeakingSeconds: 30,
      chunksWithoutHandback: 3,           // fires sustainedMonologue
      pointMadeInRecentChunk: true,
      currentContinuesAfterPoint: true,    // fires continuingAfterPoint
      recentPreambleCount: 0,
    };
    const result = determineCoaching(analysis, session, contextSignals);
    assert.equal(result.primaryReason, 'continuingAfterPoint',
      `Expected continuingAfterPoint, got ${result.primaryReason}`);
  });

  it('should prefer chronicPreamble over sustainedMonologue', () => {
    // Both sustainedMonologue and chronicPreamble fire simultaneously.
    // chronicPreamble should win because it's more specific.
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      hasFloorHandback: false,
      hasPreamblePattern: true,
      wordCount: 25,
    });
    const contextSignals = {
      windowSize: 3,
      recentSpeakingSeconds: 30,
      chunksWithoutHandback: 2,           // fires sustainedMonologue
      pointMadeInRecentChunk: false,
      currentContinuesAfterPoint: false,
      recentPreambleCount: 2,             // fires chronicPreamble
    };
    const result = determineCoaching(analysis, session, contextSignals);
    assert.equal(result.primaryReason, 'chronicPreamble',
      `Expected chronicPreamble, got ${result.primaryReason}`);
  });

  it('should prefer continuingAfterPoint over chronicPreamble', () => {
    // All three context reasons fire. continuingAfterPoint should win.
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      hasFloorHandback: false,
      hasPreamblePattern: true,
      wordCount: 25,
    });
    const contextSignals = {
      windowSize: 4,
      recentSpeakingSeconds: 40,
      chunksWithoutHandback: 3,           // fires sustainedMonologue
      pointMadeInRecentChunk: true,
      currentContinuesAfterPoint: true,    // fires continuingAfterPoint
      recentPreambleCount: 2,             // fires chronicPreamble
    };
    const result = determineCoaching(analysis, session, contextSignals);
    assert.equal(result.primaryReason, 'continuingAfterPoint',
      `Expected continuingAfterPoint, got ${result.primaryReason}`);
  });

  it('should use sustainedMonologue when it is the only context reason', () => {
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: false,
      hasFloorHandback: false,
      wordCount: 25,
    });
    const contextSignals = {
      windowSize: 3,
      recentSpeakingSeconds: 30,
      chunksWithoutHandback: 3,           // fires sustainedMonologue
      pointMadeInRecentChunk: false,
      currentContinuesAfterPoint: false,   // does NOT fire
      recentPreambleCount: 0,             // does NOT fire
    };
    const result = determineCoaching(analysis, session, contextSignals);
    assert.equal(result.primaryReason, 'sustainedMonologue',
      `Expected sustainedMonologue, got ${result.primaryReason}`);
  });

  it('should still bump state correctly when multiple context signals fire', () => {
    // Start at green, both sustainedMonologue and continuingAfterPoint fire.
    // sustainedMonologue bumps green→yellow, continuingAfterPoint bumps yellow→red.
    const session = fakeSession({ totalSpeakingSeconds: 0 });
    const analysis = fakeAnalysis({
      estimatedSeconds: 10,
      hasQuestion: true,       // hasFloorHandback is undefined → falls back to hasQuestion
      hasFloorHandback: false, // context layer sees no handback
      wordCount: 10,           // too short for Step 2 noFloorHandback bump
    });
    const contextSignals = {
      windowSize: 3,
      recentSpeakingSeconds: 30,
      chunksWithoutHandback: 2,           // fires sustainedMonologue
      pointMadeInRecentChunk: true,
      currentContinuesAfterPoint: true,    // fires continuingAfterPoint
      recentPreambleCount: 0,
    };
    const result = determineCoaching(analysis, session, contextSignals);
    // Two bumps: green→yellow (sustained) → yellow→red (continuing)
    assert.equal(result.state, 'red',
      `Expected red from double context bump, got ${result.state}`);
    assert.equal(result.primaryReason, 'continuingAfterPoint');
  });
});
