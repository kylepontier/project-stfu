// ============================================================================
// escalation.test.js — Tests for warning escalation logic
// ============================================================================
// Tests that escalation correctly:
//   - Resets when you go back to green
//   - Increases when consecutive warnings pile up
//   - Caps at the maximum level
//
// HOW TO RUN: node --test tests/escalation.test.js
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateEscalation, describeEscalation } from '../src/logic/escalation.js';

// ============================================================================
// DE-ESCALATION (green resets warnings)
// ============================================================================

describe('Escalation — De-escalation on green', () => {
  it('should reset consecutive warnings when green', () => {
    const result = updateEscalation('green', 0, 3);
    assert.equal(result.consecutiveWarnings, 0);
  });

  it('should decrease escalation level by 1 when green', () => {
    const result = updateEscalation('green', 2, 0);
    assert.equal(result.level, 1);
    assert.equal(result.changed, true);
  });

  it('should not go below 0', () => {
    const result = updateEscalation('green', 0, 0);
    assert.equal(result.level, 0);
    assert.equal(result.changed, false);
  });
});

// ============================================================================
// ESCALATION (yellow/red increases warnings)
// ============================================================================

describe('Escalation — Warning accumulation', () => {
  it('should increment warnings on yellow', () => {
    const result = updateEscalation('yellow', 0, 0);
    assert.equal(result.consecutiveWarnings, 1);
    assert.equal(result.level, 0);
  });

  it('should increment warnings on red', () => {
    const result = updateEscalation('red', 0, 0);
    assert.equal(result.consecutiveWarnings, 1);
  });

  it('should escalate after reaching warning threshold', () => {
    // Default warningsBeforeEscalate = 2
    // Starting with 1 consecutive warning, adding another → triggers escalation
    const result = updateEscalation('red', 0, 1);
    assert.equal(result.level, 1);
    assert.equal(result.changed, true);
    // Warnings reset after escalation
    assert.equal(result.consecutiveWarnings, 0);
  });

  it('should cap at maximum escalation level', () => {
    // Already at max (2), should not go higher
    const result = updateEscalation('red', 2, 1);
    assert.equal(result.level, 2);
    // Warnings keep accumulating but level stays at max
    assert.equal(result.consecutiveWarnings, 2);
  });
});

// ============================================================================
// DESCRIPTION
// ============================================================================

describe('Escalation — describeEscalation', () => {
  it('should describe level 0', () => {
    const desc = describeEscalation(0);
    assert.ok(desc.includes('Normal'));
  });

  it('should describe level 1', () => {
    const desc = describeEscalation(1);
    assert.ok(desc.includes('Elevated'));
  });

  it('should describe level 2', () => {
    const desc = describeEscalation(2);
    assert.ok(desc.includes('Urgent'));
  });
});
