// ============================================================================
// session.test.js — Tests for session management
// ============================================================================
// Tests the session lifecycle: start, stop, reset.
// Also tests getStatus() for the AFD discovery pattern.
//
// HOW TO RUN: node --test tests/session.test.js
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, stopSession, resetSession, getStatus } from '../src/logic/session.js';
import * as store from '../src/data/store.js';

// Before each test, make sure there's no leftover session
beforeEach(() => {
  store.clearSession();
});

// ============================================================================
// START SESSION
// ============================================================================

describe('Session — startSession', () => {
  it('should start a new session successfully', () => {
    const result = startSession();
    assert.equal(result.success, true);
    assert.ok(result.data.id.startsWith('session-'));
    assert.equal(result.data.status, 'active');
  });

  it('should not start a session if one is already active', () => {
    startSession();
    const result = startSession();
    assert.equal(result.success, false);
    assert.ok(result.message.includes('already active'));
  });

  it('should accept custom thresholds', () => {
    const result = startSession({ greenMax: 30, yellowMax: 60 });
    assert.equal(result.data.thresholds.greenMax, 30);
    assert.equal(result.data.thresholds.yellowMax, 60);
  });
});

// ============================================================================
// STOP SESSION
// ============================================================================

describe('Session — stopSession', () => {
  it('should stop an active session', async () => {
    startSession();
    const result = await stopSession();
    assert.equal(result.success, true);
    assert.equal(result.data.status, 'stopped');
    assert.ok(result.data.stoppedAt);
  });

  it('should fail if no session exists', async () => {
    const result = await stopSession();
    assert.equal(result.success, false);
  });

  it('should fail if session is already stopped', async () => {
    startSession();
    await stopSession();
    const result = await stopSession();
    assert.equal(result.success, false);
    assert.ok(result.message.includes('already stopped'));
  });
});

// ============================================================================
// RESET SESSION
// ============================================================================

describe('Session — resetSession', () => {
  it('should reset an active session', () => {
    startSession();
    const result = resetSession();
    assert.equal(result.success, true);
    assert.equal(store.getSession(), null);
  });

  it('should fail if no session exists', () => {
    const result = resetSession();
    assert.equal(result.success, false);
  });
});

// ============================================================================
// GET STATUS (AFD Discovery)
// ============================================================================

describe('Session — getStatus', () => {
  it('should return idle when no session exists', () => {
    const result = getStatus();
    assert.equal(result.success, true);
    assert.equal(result.data.status, 'idle');
    assert.equal(result.data.hasActiveSession, false);
  });

  it('should return active session info', () => {
    startSession();
    const result = getStatus();
    assert.equal(result.data.hasActiveSession, true);
    assert.equal(result.data.status, 'active');
    assert.equal(result.data.coachingState, 'green');
  });
});
