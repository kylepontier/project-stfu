// ============================================================================
// analyzer.test.js — Tests for the transcript analyzer
// ============================================================================
// These tests verify that the analyzer correctly:
//   - Counts words and estimates speaking time
//   - Detects questions
//   - Detects tone patterns (over-explanatory, defensive, abstract)
//   - Handles edge cases (empty input, very short input)
//
// V2 ADDITIONS:
//   - Detects preamble/windup patterns
//   - Detects post-point rambling
//   - Counts concrete indicators
//   - Detects genuine floor handbacks (vs rhetorical questions)
//
// HOW TO RUN: node --test tests/analyzer.test.js
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeChunk } from '../src/logic/analyzer.js';

// ============================================================================
// WORD COUNT AND TIMING
// ============================================================================

describe('Analyzer — Word count and timing', () => {
  it('should count words correctly', () => {
    const result = analyzeChunk('Hello world this is a test');
    assert.equal(result.wordCount, 6);
  });

  it('should estimate speaking time based on word count', () => {
    // 25 words at 2.5 words/sec = 10 seconds
    const words = Array(25).fill('word').join(' ');
    const result = analyzeChunk(words);
    assert.equal(result.estimatedSeconds, 10);
  });

  it('should handle empty input gracefully', () => {
    const result = analyzeChunk('');
    assert.equal(result.wordCount, 0);
    assert.equal(result.estimatedSeconds, 0);
    assert.equal(result.hasQuestion, false);
  });

  it('should handle null/undefined input gracefully', () => {
    const result = analyzeChunk(null);
    assert.equal(result.wordCount, 0);
  });

  it('should handle whitespace-only input', () => {
    const result = analyzeChunk('   \n\t  ');
    assert.equal(result.wordCount, 0);
  });
});

// ============================================================================
// QUESTION DETECTION
// ============================================================================

describe('Analyzer — Question detection', () => {
  it('should detect a question mark', () => {
    const result = analyzeChunk('How are you doing today?');
    assert.equal(result.hasQuestion, true);
  });

  it('should detect common question phrases', () => {
    const result = analyzeChunk('What do you think about this approach');
    assert.equal(result.hasQuestion, true);
  });

  it('should detect "does that make sense"', () => {
    const result = analyzeChunk('So I refactored the module. Does that make sense');
    assert.equal(result.hasQuestion, true);
  });

  it('should NOT detect a question when there is none', () => {
    const result = analyzeChunk('I think we should go with plan B and move forward');
    assert.equal(result.hasQuestion, false);
  });
});

// ============================================================================
// TONE DETECTION — Over-explanatory
// ============================================================================

describe('Analyzer — Over-explanatory detection', () => {
  it('should flag over-explanatory language', () => {
    const text = 'So basically the thing is, what I mean is, let me explain why this is essentially the right approach. In other words, the point is we need to be clear.';
    const result = analyzeChunk(text);
    assert.ok(result.toneFlags.includes('over-explanatory'),
      `Expected over-explanatory flag. Got: ${result.toneFlags}`);
  });

  it('should NOT flag clean, concise language', () => {
    const text = 'I suggest we use approach A because it reduces latency by 40 percent.';
    const result = analyzeChunk(text);
    assert.ok(!result.toneFlags.includes('over-explanatory'),
      `Did not expect over-explanatory flag. Got: ${result.toneFlags}`);
  });
});

// ============================================================================
// TONE DETECTION — Defensive
// ============================================================================

describe('Analyzer — Defensive detection', () => {
  it('should flag defensive language', () => {
    const text = 'But actually that is not what I said. However, I never said that. You dont understand what I was trying to say. Let me finish. Thats not fair, I was just explaining my point. In my defense, im not saying anything wrong.';
    const result = analyzeChunk(text);
    assert.ok(result.toneFlags.includes('defensive'),
      `Expected defensive flag. Got: ${result.toneFlags}`);
  });

  it('should NOT flag neutral language', () => {
    const text = 'I see your point. That is a good perspective. Let us explore that idea further.';
    const result = analyzeChunk(text);
    assert.ok(!result.toneFlags.includes('defensive'),
      `Did not expect defensive flag. Got: ${result.toneFlags}`);
  });
});

// ============================================================================
// TONE DETECTION — Abstract
// ============================================================================

describe('Analyzer — Abstract detection', () => {
  it('should flag abstract language', () => {
    const text = 'Theoretically and conceptually, from a strategic standpoint, the paradigm shift we need is holistically about rethinking the framework at a high level. In principle, hypothetically speaking, broadly speaking we need a new paradigm.';
    const result = analyzeChunk(text);
    assert.ok(result.toneFlags.includes('abstract'),
      `Expected abstract flag. Got: ${result.toneFlags}`);
  });

  it('should NOT flag concrete language', () => {
    const text = 'We shipped 300 units last Tuesday. Revenue was up 12 percent. The server responded in under 50 milliseconds.';
    const result = analyzeChunk(text);
    assert.ok(!result.toneFlags.includes('abstract'),
      `Did not expect abstract flag. Got: ${result.toneFlags}`);
  });
});

// ============================================================================
// V2: PREAMBLE / WINDUP DETECTION
// ============================================================================

describe('Analyzer V2 — Preamble detection', () => {
  it('should detect preamble when first half is full of setup phrases', () => {
    // First half: heavy with preamble keywords
    // Second half: the actual point
    const text = 'So the context is that we had a meeting last month. The backstory here is that the team was struggling. Just to set the stage, a little background on why this matters. To give you some background, the project has been delayed. So what happened was the client changed the requirements. Anyway, I think we should switch to weekly sprints.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPreamblePattern, true,
      `Expected preamble pattern. Score: ${result.preambleScore}`);
    assert.ok(result.preambleScore >= 2,
      `Expected preamble score >= 2, got ${result.preambleScore}`);
  });

  it('should NOT detect preamble in concise, direct speech', () => {
    const text = 'I think we should switch to weekly sprints. The current biweekly cadence is too slow for the pace of change we are seeing. We can start next Monday and evaluate after four weeks to see if the velocity improves enough to justify the overhead of more frequent ceremonies.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPreamblePattern, false,
      `Did not expect preamble pattern. Score: ${result.preambleScore}`);
  });

  it('should NOT flag short chunks even with preamble words', () => {
    // Under preambleMinWords (40), should not flag
    const text = 'So the context is that we need to move faster.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPreamblePattern, false);
  });
});

// ============================================================================
// V2: POST-POINT RAMBLE DETECTION
// ============================================================================

describe('Analyzer V2 — Post-point ramble detection', () => {
  it('should detect rambling after a conclusion marker', () => {
    // Point is made, then lots of continuation
    const text = 'We have been discussing this for weeks and the team has different views on the approach. My recommendation is that we go with plan B. And also I wanted to mention that the budget might be an issue. And another thing, we should probably check with legal. On top of that, there is the marketing timeline to consider. Not to mention the partner dependencies. Oh and one more thing, we need to loop in the design team about the updated assets.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPostPointRamble, true,
      `Expected post-point ramble. Score: ${result.postPointScore}`);
  });

  it('should NOT flag when the conclusion is near the end', () => {
    const text = 'We looked at three options. Plan A costs too much. Plan C has too many unknowns and the timeline does not support it. The risks outweigh the potential benefits. So in short, we should go with plan B.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPostPointRamble, false,
      `Did not expect post-point ramble`);
  });

  it('should NOT flag text without conclusion markers', () => {
    const text = 'I have been thinking about this problem from several angles and I want to share my analysis with the group before we make any final decisions about the direction forward. There are many considerations to weigh here.';
    const result = analyzeChunk(text);
    assert.equal(result.hasPostPointRamble, false);
  });
});

// ============================================================================
// V2: CONCRETE INDICATORS
// ============================================================================

describe('Analyzer V2 — Concrete indicators', () => {
  it('should count concrete indicators in grounded speech', () => {
    const text = 'For example, last week we shipped the new dashboard. The data shows a 15 percent increase in engagement. Specifically, active users went from 3000 to 3450 in the first hours after launch.';
    const result = analyzeChunk(text);
    assert.ok(result.concreteScore >= 3,
      `Expected concreteScore >= 3, got ${result.concreteScore}`);
  });

  it('should have zero concrete indicators in abstract speech', () => {
    const text = 'Theoretically the paradigm needs to shift holistically toward a more conceptual framework that broadly speaking addresses the philosophical underpinnings of our strategic approach.';
    const result = analyzeChunk(text);
    assert.equal(result.concreteScore, 0);
  });
});

// ============================================================================
// V2: FLOOR HANDBACK DETECTION
// ============================================================================

describe('Analyzer V2 — Floor handback detection', () => {
  it('should detect engagement question at the end', () => {
    const text = 'I think we should restructure the team into two pods. The first pod handles the API and the second handles the frontend. What do you think';
    const result = analyzeChunk(text);
    assert.equal(result.hasFloorHandback, true);
  });

  it('should detect a genuine question mark at the end', () => {
    const text = 'We could launch next Thursday or wait until after the holiday. Which timeline works better for the marketing team and the sales pipeline commitments we already have scheduled?';
    const result = analyzeChunk(text);
    assert.equal(result.hasFloorHandback, true);
  });

  it('should NOT count rhetorical "right?" as floor handback', () => {
    const text = 'So the plan is solid and we all agree on the timeline and the budget works and the stakeholders signed off. We are in great shape, right? So I think we should just move forward with the implementation as planned and not second guess ourselves.';
    const result = analyzeChunk(text);
    assert.equal(result.hasFloorHandback, false,
      'Rhetorical "right?" in the middle should not count as floor handback');
  });

  it('should NOT detect floor handback when there is no question', () => {
    const text = 'I believe we should proceed with the current plan and not make any changes at this point because the risks are manageable and the timeline is tight enough already.';
    const result = analyzeChunk(text);
    assert.equal(result.hasFloorHandback, false);
  });
});
