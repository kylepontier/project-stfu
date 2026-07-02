// ============================================================================
// context.test.js — Tests for the rolling conversational context layer
// ============================================================================
// The context module looks at recent chunks + current analysis and computes
// signals that span multiple chunks. These tests verify each signal in
// isolation, then test the interaction between signals.
//
// HOW TO RUN: node --test tests/context.test.js
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeContext } from '../src/logic/context.js';

// ============================================================================
// HELPER — Build a fake chunk object (as stored by addChunk in the store)
// ============================================================================

/**
 * Create a minimal chunk with sensible defaults.
 * Override any field by passing it in the `overrides` object.
 */
function fakeChunk(overrides = {}) {
  return {
    text: 'Some chunk text.',
    wordCount: 25,
    estimatedSeconds: 10,
    hasQuestion: false,
    toneFlags: [],
    coachingState: 'green',
    hasFloorHandback: false,
    hasPreamblePattern: false,
    hasPostPointRamble: false,
    ...overrides,
  };
}

/**
 * Create a minimal current analysis object.
 * Override any field by passing it in the `overrides` object.
 */
function fakeAnalysis(overrides = {}) {
  return {
    wordCount: 30,
    estimatedSeconds: 12,
    hasQuestion: false,
    toneFlags: [],
    hasFloorHandback: false,
    hasPreamblePattern: false,
    hasPostPointRamble: false,
    ...overrides,
  };
}

// ============================================================================
// Signal 1: recentSpeakingSeconds
// ============================================================================

describe('Context — recentSpeakingSeconds', () => {
  it('should sum seconds from recent chunks plus current analysis', () => {
    const chunks = [
      fakeChunk({ estimatedSeconds: 10 }),
      fakeChunk({ estimatedSeconds: 15 }),
    ];
    const analysis = fakeAnalysis({ estimatedSeconds: 20 });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.recentSpeakingSeconds, 45,
      '10 + 15 + 20 = 45 seconds');
  });

  it('should handle empty chunk history', () => {
    const ctx = computeContext([], fakeAnalysis({ estimatedSeconds: 8 }));
    assert.equal(ctx.recentSpeakingSeconds, 8,
      'Only current chunk — 8 seconds');
  });

  it('should only use the last N chunks based on window size', () => {
    // Window size is 3 by default. With 5 chunks, only the last 3 count.
    const chunks = [
      fakeChunk({ estimatedSeconds: 100 }), // Too old — outside window
      fakeChunk({ estimatedSeconds: 100 }), // Too old — outside window
      fakeChunk({ estimatedSeconds: 5 }),
      fakeChunk({ estimatedSeconds: 5 }),
      fakeChunk({ estimatedSeconds: 5 }),
    ];
    const analysis = fakeAnalysis({ estimatedSeconds: 5 });

    const ctx = computeContext(chunks, analysis);
    // Should be 5 + 5 + 5 + 5 = 20, NOT 100 + 100 + 5 + 5 + 5 + 5
    assert.equal(ctx.recentSpeakingSeconds, 20);
  });
});

// ============================================================================
// Signal 2: chunksWithoutHandback
// ============================================================================

describe('Context — chunksWithoutHandback', () => {
  it('should be 0 when current chunk has floor handback', () => {
    const chunks = [
      fakeChunk({ hasFloorHandback: false }),
      fakeChunk({ hasFloorHandback: false }),
    ];
    const analysis = fakeAnalysis({ hasFloorHandback: true });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.chunksWithoutHandback, 0);
  });

  it('should count consecutive chunks without handback ending at current', () => {
    const chunks = [
      fakeChunk({ hasFloorHandback: true }),  // Had handback — streak stops here
      fakeChunk({ hasFloorHandback: false }),  // No handback
      fakeChunk({ hasFloorHandback: false }),  // No handback
    ];
    const analysis = fakeAnalysis({ hasFloorHandback: false });

    const ctx = computeContext(chunks, analysis);
    // Current + 2 preceding = 3 (stops at the chunk that had handback)
    assert.equal(ctx.chunksWithoutHandback, 3);
  });

  it('should count all chunks when none have handback', () => {
    const chunks = [
      fakeChunk({ hasFloorHandback: false }),
      fakeChunk({ hasFloorHandback: false }),
    ];
    const analysis = fakeAnalysis({ hasFloorHandback: false });

    const ctx = computeContext(chunks, analysis);
    // Current + 2 preceding = 3 (within window, all count)
    assert.equal(ctx.chunksWithoutHandback, 3);
  });

  it('should fall back to hasQuestion when hasFloorHandback is undefined', () => {
    const chunks = [
      fakeChunk({ hasFloorHandback: undefined, hasQuestion: true }),
    ];
    const analysis = fakeAnalysis({ hasFloorHandback: undefined, hasQuestion: false });

    const ctx = computeContext(chunks, analysis);
    // Current has no question → starts counting. Previous has question → stops.
    assert.equal(ctx.chunksWithoutHandback, 1);
  });
});

// ============================================================================
// Signal 3: pointMadeInRecentChunk
// ============================================================================

describe('Context — pointMadeInRecentChunk', () => {
  it('should be true when a recent chunk had post-point ramble', () => {
    const chunks = [
      fakeChunk({ hasPostPointRamble: false }),
      fakeChunk({ hasPostPointRamble: true }),
    ];
    const analysis = fakeAnalysis();

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.pointMadeInRecentChunk, true);
  });

  it('should be false when no recent chunks had post-point ramble', () => {
    const chunks = [
      fakeChunk({ hasPostPointRamble: false }),
      fakeChunk({ hasPostPointRamble: false }),
    ];
    const analysis = fakeAnalysis();

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.pointMadeInRecentChunk, false);
  });
});

// ============================================================================
// Signal 4: currentContinuesAfterPoint
// ============================================================================

describe('Context — currentContinuesAfterPoint', () => {
  it('should be true when a prior chunk had a point and current does not', () => {
    const chunks = [
      fakeChunk({ hasPostPointRamble: true }),
    ];
    const analysis = fakeAnalysis({ hasPostPointRamble: false });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.currentContinuesAfterPoint, true);
  });

  it('should be false when current chunk ALSO has a post-point ramble', () => {
    const chunks = [
      fakeChunk({ hasPostPointRamble: true }),
    ];
    // Current chunk has its own point + ramble — single-chunk detector handles it
    const analysis = fakeAnalysis({ hasPostPointRamble: true });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.currentContinuesAfterPoint, false);
  });

  it('should be false when no prior chunk had a point', () => {
    const chunks = [
      fakeChunk({ hasPostPointRamble: false }),
    ];
    const analysis = fakeAnalysis({ hasPostPointRamble: false });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.currentContinuesAfterPoint, false);
  });
});

// ============================================================================
// Signal 5: recentPreambleCount
// ============================================================================

describe('Context — recentPreambleCount', () => {
  it('should count preamble chunks in window plus current', () => {
    const chunks = [
      fakeChunk({ hasPreamblePattern: true }),
      fakeChunk({ hasPreamblePattern: false }),
      fakeChunk({ hasPreamblePattern: true }),
    ];
    const analysis = fakeAnalysis({ hasPreamblePattern: true });

    const ctx = computeContext(chunks, analysis);
    // 2 from window (only last 3 chunks used) + 1 current = 3
    assert.equal(ctx.recentPreambleCount, 3);
  });

  it('should be 0 when no chunks have preamble', () => {
    const chunks = [
      fakeChunk({ hasPreamblePattern: false }),
    ];
    const analysis = fakeAnalysis({ hasPreamblePattern: false });

    const ctx = computeContext(chunks, analysis);
    assert.equal(ctx.recentPreambleCount, 0);
  });

  it('should only count current analysis when history is empty', () => {
    const analysis = fakeAnalysis({ hasPreamblePattern: true });

    const ctx = computeContext([], analysis);
    assert.equal(ctx.recentPreambleCount, 1);
  });
});

// ============================================================================
// Window size
// ============================================================================

describe('Context — windowSize tracking', () => {
  it('should report the actual number of chunks examined', () => {
    const chunks = [fakeChunk(), fakeChunk()];
    const analysis = fakeAnalysis();

    const ctx = computeContext(chunks, analysis);
    // 2 recent + 1 current = 3
    assert.equal(ctx.windowSize, 3);
  });

  it('should handle first chunk (no history)', () => {
    const ctx = computeContext([], fakeAnalysis());
    assert.equal(ctx.windowSize, 1);
  });
});
