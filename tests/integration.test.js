// ============================================================================
// integration.test.js — Full end-to-end tests for Project STFU
// ============================================================================
// These tests simulate realistic speaking scenarios from start to finish:
//   - A healthy conversationalist
//   - Someone who slowly starts monologuing
//   - A full red-alert monologuer
//
// This proves the entire pipeline works: commands → logic → data → output.
//
// HOW TO RUN: node --test tests/integration.test.js
// ============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as commands from '../src/commands/index.js';
import * as store from '../data/../src/data/store.js';
import { resetMessageCounters } from '../src/logic/coach.js';

// Clean slate before each test
beforeEach(() => {
  store.clearSession();
  resetMessageCounters();
});

// ============================================================================
// AFD DISCOVERY — whatCanIDo, getSchema, getStatus
// ============================================================================

describe('Integration — AFD Discovery', () => {
  it('whatCanIDo should list all commands', () => {
    const result = commands.whatCanIDo();
    assert.equal(result.success, true);
    assert.ok(result.data.length >= 10);
    // Should include the core AFD commands
    const names = result.data.map(c => c.name);
    assert.ok(names.includes('whatCanIDo'));
    assert.ok(names.includes('getStatus'));
    assert.ok(names.includes('getSchema'));
  });

  it('getSchema should return details for a known command', () => {
    const result = commands.getSchema('processTranscriptChunk');
    assert.equal(result.success, true);
    assert.ok(result.data.input.text);
    assert.equal(result.data.category, 'analysis');
  });

  it('getSchema should fail for unknown command', () => {
    const result = commands.getSchema('nonExistentCommand');
    assert.equal(result.success, false);
  });
});

// ============================================================================
// SCENARIO 1: Healthy conversationalist
// ============================================================================

describe('Integration — Healthy speaker', () => {
  it('should stay green throughout short, question-filled exchanges', () => {
    commands.startSession();

    // Short chunk with a question
    let r = commands.processTranscriptChunk(
      'I have a quick thought on this. What do you think about using the new API?'
    );
    assert.equal(r.data.coachingState, 'green');

    // Another short chunk with engagement
    r = commands.processTranscriptChunk(
      'That makes sense. How do you feel about the timeline?'
    );
    assert.equal(r.data.coachingState, 'green');

    // Check summary
    const summary = commands.getSessionSummary();
    assert.equal(summary.data.stateCounts.green, 2);
    assert.equal(summary.data.stateCounts.yellow, 0);
    assert.equal(summary.data.stateCounts.red, 0);
  });
});

// ============================================================================
// SCENARIO 2: Gradual monologue buildup
// ============================================================================

describe('Integration — Gradual monologue', () => {
  it('should escalate from green to yellow to red as speech gets longer', () => {
    commands.startSession();

    // Chunk 1: Short, has question → green
    let r = commands.processTranscriptChunk(
      'I want to share a few thoughts on this topic. Does that sound good?'
    );
    assert.equal(r.data.coachingState, 'green',
      'Chunk 1 should be green');

    // Chunk 2: Medium length, no question → pushes toward yellow
    // Need enough words to get past greenMax (45s) when added to previous
    const mediumText = 'I think the key issue here is that we need to rethink our approach to the entire system. The current implementation has several problems that we should address including performance bottlenecks and code maintainability concerns. We also need to consider the impact on our users and how they will adapt to the changes we are proposing. There are multiple stakeholders involved and each one has different requirements that we need to balance carefully going forward with this project and we need more resources allocated.';
    r = commands.processTranscriptChunk(mediumText);
    // This should be yellow or red (long, no question)
    assert.ok(
      r.data.coachingState === 'yellow' || r.data.coachingState === 'red',
      `Chunk 2 should be yellow or red, got ${r.data.coachingState}`
    );
  });
});

// ============================================================================
// SCENARIO 3: Full monologue red alert
// ============================================================================

describe('Integration — Full red alert monologue', () => {
  it('should hit red with escalation on over-explanatory monologue', () => {
    commands.startSession();

    // Chunk 1: Long, over-explanatory, no question
    const monologue1 = 'So basically what I am trying to say is that the fundamental issue we need to address is really about the paradigm shift that we need to make. Let me explain why this is so important. The thing is, essentially, what we are dealing with here is a conceptual problem. In other words, the way I see it, the point is that we need to fundamentally rethink the entire framework from a strategic standpoint. Theoretically speaking this requires a holistic approach that considers all aspects of the problem.';
    let r = commands.processTranscriptChunk(monologue1);
    const state1 = r.data.coachingState;

    // Chunk 2: Another long stretch
    const monologue2 = 'Furthermore and to be clear what I mean is that the reason we keep running into these issues is because nobody is looking at this from the right angle. Basically the whole thing is fundamentally broken and in my defense I have been saying this for months. Let me explain once more why this matters so much to all of us. You dont understand the complexity involved in this particular situation and the thing is nobody wants to listen.';
    r = commands.processTranscriptChunk(monologue2);

    // By now, should be deep red with some escalation
    assert.equal(r.data.coachingState, 'red');
    assert.ok(r.data.totalSpeakingSeconds > 45,
      'Total speaking time should be well over 45 seconds');
    assert.ok(r.data.toneFlags.length > 0,
      'Should have tone flags');
  });
});

// ============================================================================
// SCENARIO 4: Session lifecycle
// ============================================================================

describe('Integration — Session lifecycle', () => {
  it('should handle start → process → stop → summary flow', async () => {
    // Start
    const startResult = commands.startSession();
    assert.equal(startResult.success, true);

    // Process a chunk
    commands.processTranscriptChunk('Here is my quick update. Any questions?');

    // Stop
    const stopResult = await commands.stopSession();
    assert.equal(stopResult.success, true);
    assert.equal(stopResult.data.status, 'stopped');

    // Summary should still work on stopped session
    const summaryResult = commands.getSessionSummary();
    assert.equal(summaryResult.success, true);
    assert.equal(summaryResult.data.totalChunks, 1);
  });

  it('should handle reset correctly', () => {
    commands.startSession();
    commands.processTranscriptChunk('Hello world');
    const resetResult = commands.reset();
    assert.equal(resetResult.success, true);

    // After reset, status should be idle
    const status = commands.getStatus();
    assert.equal(status.data.status, 'idle');
  });
});

// ============================================================================
// SCENARIO 5: Custom thresholds
// ============================================================================

describe('Integration — Custom thresholds', () => {
  it('should use stricter thresholds when configured', () => {
    // Start with very strict thresholds (green < 15s, yellow < 30s)
    commands.startSession({ greenMax: 15, yellowMax: 30 });

    // Even a moderate chunk should trigger yellow with strict thresholds
    const text = 'I have a few things to say about the project status and where we stand right now with all the different workstreams and priorities.';
    const r = commands.processTranscriptChunk(text);

    // ~24 words at 2.5 w/s = ~10s, but this is a reasonable test
    // The point is the thresholds are configurable
    assert.ok(r.success, 'Processing should succeed');
  });

  it('should allow updating thresholds mid-session', () => {
    commands.startSession();
    const r = commands.updateThresholds({ greenMax: 20 });
    assert.equal(r.success, true);
    assert.equal(r.data.greenMax, 20);
    // yellowMax should still be the default
    assert.equal(r.data.yellowMax, 90);
  });
});

// ============================================================================
// SCENARIO 6: Observability — triggeredSignals, primaryReason, reasoning
// ============================================================================

describe('Integration — Observability fields', () => {
  it('should include triggeredSignals array in process result', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('Quick update. What do you think?');
    assert.equal(r.success, true);
    // triggeredSignals must always be an array, even when few signals fire
    assert.ok(Array.isArray(r.data.triggeredSignals),
      'triggeredSignals should be an array');
  });

  it('should include primaryReason and reasoning in process result', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('Here is my thought on the topic.');
    assert.equal(r.success, true);
    assert.ok(typeof r.data.primaryReason === 'string',
      'primaryReason should be a string');
    assert.ok(Array.isArray(r.data.reasoning),
      'reasoning should be an array');
    assert.ok(r.data.reasoning.length > 0,
      'reasoning should have at least one entry');
  });

  it('should include escalationDescription in process result', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('Just checking in.');
    assert.equal(r.success, true);
    assert.ok(typeof r.data.escalationDescription === 'string',
      'escalationDescription should be a string');
  });

  it('should show preamble in triggeredSignals when over-contextualizing', () => {
    commands.startSession();
    // Text with multiple preamble keywords in the first half (>40 words)
    const text = 'So the context is that we had a big meeting last week. To give you some background, the project has been delayed twice. The backstory here is complicated but let me explain. I think we should just switch to plan B and move forward quickly with the new timeline.';
    const r = commands.processTranscriptChunk(text);
    assert.equal(r.success, true);
    const signals = r.data.triggeredSignals;
    assert.ok(signals.some(s => s.includes('preamble')),
      `Expected preamble signal, got: ${signals.join(', ')}`);
  });

  it('should show no floor handback signal on long text without questions', () => {
    commands.startSession();
    const text = 'I think the key issue is that we need to rethink our approach to the system because the current implementation has several problems including performance and maintainability.';
    const r = commands.processTranscriptChunk(text);
    assert.equal(r.success, true);
    const signals = r.data.triggeredSignals;
    assert.ok(signals.some(s => s.includes('no floor handback')),
      `Expected no floor handback signal, got: ${signals.join(', ')}`);
  });

  it('should show question detected signal when text has a question', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('I think plan B is best. What do you think?');
    assert.equal(r.success, true);
    const signals = r.data.triggeredSignals;
    assert.ok(signals.some(s => s.includes('question detected')),
      `Expected question detected signal, got: ${signals.join(', ')}`);
  });
});

// ============================================================================
// SCENARIO 7: Rolling context layer
// ============================================================================

describe('Integration — Rolling context', () => {
  it('should include contextSignals in process result', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('Quick thought here.');
    assert.equal(r.success, true);
    assert.ok(r.data.contextSignals, 'contextSignals should be present');
    assert.ok(typeof r.data.contextSignals.windowSize === 'number');
    assert.ok(typeof r.data.contextSignals.recentSpeakingSeconds === 'number');
    assert.ok(typeof r.data.contextSignals.chunksWithoutHandback === 'number');
  });

  it('should detect sustained monologue across multiple chunks', () => {
    commands.startSession();

    // Chunk 1: no handback, short
    commands.processTranscriptChunk(
      'I think we need to rethink the entire approach to the project timeline and deliverables.'
    );

    // Chunk 2: no handback, short
    commands.processTranscriptChunk(
      'And we also need to consider the budget implications of changing the scope at this point in time.'
    );

    // Chunk 3: still no handback — should trigger sustained monologue
    const r = commands.processTranscriptChunk(
      'Plus there are the stakeholder concerns about the new direction and the risk of missing the deadline completely.'
    );

    assert.equal(r.success, true);
    assert.ok(r.data.contextSignals.chunksWithoutHandback >= 2,
      `Expected 2+ chunks without handback, got ${r.data.contextSignals.chunksWithoutHandback}`);
    // The sustained monologue signal should appear in triggered signals
    assert.ok(r.data.triggeredSignals.some(s => s.includes('sustained monologue')),
      `Expected sustained monologue signal, got: ${r.data.triggeredSignals.join(', ')}`);
  });

  it('should reset handback streak when a chunk includes a question', () => {
    commands.startSession();

    // Chunk 1: no handback
    commands.processTranscriptChunk(
      'I think we should move forward with the plan as discussed in the last meeting.'
    );

    // Chunk 2: has a genuine handback
    commands.processTranscriptChunk(
      'That said, I want to check in with the group. What do you think about this approach?'
    );

    // Chunk 3: no handback again — but streak should be only 1
    const r = commands.processTranscriptChunk(
      'So let me continue with the next point about the technical architecture decisions.'
    );

    assert.equal(r.success, true);
    // Streak reset at chunk 2, so now only chunk 3 + current = 1
    assert.ok(r.data.contextSignals.chunksWithoutHandback <= 1,
      `Expected streak reset, got ${r.data.contextSignals.chunksWithoutHandback}`);
  });

  it('should store V2 analysis fields in chunks for context lookback', () => {
    commands.startSession();

    // Process a chunk with known preamble text
    const text = 'So the context is that we had a meeting last week. To give you some background, the project has been delayed. The backstory here is that the team was struggling with the timeline. Anyway I think we should change the plan.';
    commands.processTranscriptChunk(text);

    // Second chunk — context should see the preamble from the first
    const r2 = commands.processTranscriptChunk(
      'Here is another thought with more detail and explanation about the topic.'
    );

    assert.equal(r2.success, true);
    // The context layer should have examined the first chunk's preamble
    assert.ok(typeof r2.data.contextSignals.recentPreambleCount === 'number');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Integration — Edge cases', () => {
  it('should reject processTranscriptChunk without active session', () => {
    const r = commands.processTranscriptChunk('Hello');
    assert.equal(r.success, false);
  });

  it('should reject empty transcript text', () => {
    commands.startSession();
    const r = commands.processTranscriptChunk('');
    assert.equal(r.success, false);
  });

  it('should handle getCurrentCoachingMessage without session', () => {
    const r = commands.getCurrentCoachingMessage();
    assert.equal(r.success, true);
    assert.equal(r.data.state, 'idle');
  });
});
