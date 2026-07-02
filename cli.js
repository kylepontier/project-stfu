#!/usr/bin/env node

// ============================================================================
// cli.js — Command-line interface for Project STFU
// ============================================================================
// This lets you test the app from the terminal without any UI.
//
// AFD PRINCIPLE: "If it can't be done via CLI, the architecture is wrong."
// Every feature is accessible here, proving the logic works independently.
//
// HOW TO USE:
//   node cli.js whatCanIDo
//   node cli.js startSession
//   node cli.js process "So basically what I was trying to say is..."
//   node cli.js status
//   node cli.js coaching
//   node cli.js stopSession
//   node cli.js summary
//   node cli.js resetSession
//   node cli.js schema startSession
//   node cli.js thresholds '{"greenMax": 30}'
// ============================================================================

import * as commands from './src/commands/index.js';

// Get the command name and arguments from the terminal
// process.argv = ['node', 'cli.js', 'commandName', ...args]
const [,, commandName, ...args] = process.argv;

/**
 * Print a result object in a readable way.
 *
 * For analysis results (from processTranscriptChunk), we print a structured
 * coaching block instead of raw JSON. This makes the CLI useful for debugging
 * and inspecting exactly what the system decided and why.
 *
 * For everything else, we print the standard success/fail + JSON format.
 */
function printResult(result) {
  if (result.success) {
    console.log('\n✓ SUCCESS:', result.message);
  } else {
    console.log('\n✗ FAILED:', result.message);
  }

  if (result.data) {
    // Check if this is an analysis result — it has coachingState + reasoning
    if (result.data.coachingState && result.data.reasoning) {
      printCoachingBlock(result.data);
    } else {
      console.log('\nData:');
      console.log(JSON.stringify(result.data, null, 2));
    }
  }
  console.log('');
}

/**
 * Print a structured coaching block for analysis results.
 *
 * This replaces the raw JSON dump with a clean, readable breakdown
 * showing exactly what the system detected and decided. It displays:
 *   - The coaching state (colored with text markers)
 *   - The primary reason the state was chosen
 *   - The coaching message the user would see
 *   - Which detection signals fired
 *   - The step-by-step reasoning chain
 *   - Escalation level
 *   - Raw analysis stats (word count, seconds, etc.)
 */
function printCoachingBlock(d) {
  // --- State header with visual marker ---
  const stateMarkers = {
    green:  '🟢 GREEN ',
    yellow: '🟡 YELLOW',
    red:    '🔴 RED   ',
  };
  const marker = stateMarkers[d.coachingState] || d.coachingState.toUpperCase();

  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log(`│  State:           ${marker}                          │`);
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Primary Reason:  ${d.primaryReason}`);
  console.log(`│  Message:         ${d.coachingMessage}`);
  console.log(`│  Escalation:      Level ${d.escalationLevel} — ${d.escalationDescription}`);
  console.log('├─────────────────────────────────────────────────────┤');

  // --- Triggered signals ---
  console.log('│  Triggered Signals:');
  if (d.triggeredSignals && d.triggeredSignals.length > 0) {
    d.triggeredSignals.forEach(sig => console.log(`│    ▸ ${sig}`));
  } else {
    console.log('│    (none)');
  }

  // --- Reasoning chain ---
  console.log('│  Reasoning:');
  if (d.reasoning && d.reasoning.length > 0) {
    d.reasoning.forEach(r => console.log(`│    • ${r}`));
  } else {
    console.log('│    (none)');
  }

  console.log('├─────────────────────────────────────────────────────┤');

  // --- Raw stats ---
  console.log(`│  Words:           ${d.wordCount}`);
  console.log(`│  Est. Seconds:    ~${d.estimatedSeconds}s`);
  console.log(`│  Total Speaking:  ~${d.totalSpeakingSeconds}s`);
  console.log(`│  Tone Flags:      ${d.toneFlags.length > 0 ? d.toneFlags.join(', ') : '(none)'}`);
  console.log(`│  Question:        ${d.hasQuestion ? 'yes' : 'no'}`);
  console.log(`│  Floor Handback:  ${d.hasFloorHandback ? 'yes' : 'no'}`);
  console.log(`│  Preamble:        ${d.hasPreamblePattern ? 'yes' : 'no'}`);
  console.log(`│  Post-Point:      ${d.hasPostPointRamble ? 'yes' : 'no'}`);
  console.log(`│  Concrete Score:  ${d.concreteScore}`);

  // --- Rolling context (V3) ---
  if (d.contextSignals) {
    const ctx = d.contextSignals;
    console.log('├─────────────────────────────────────────────────────┤');
    console.log(`│  Context Window:  ${ctx.windowSize} chunks`);
    console.log(`│  Recent Seconds:  ~${ctx.recentSpeakingSeconds}s`);
    console.log(`│  No Handback:     ${ctx.chunksWithoutHandback} consecutive chunks`);
    console.log(`│  Prior Point:     ${ctx.pointMadeInRecentChunk ? 'yes' : 'no'}`);
    console.log(`│  Continues Point: ${ctx.currentContinuesAfterPoint ? 'yes' : 'no'}`);
    console.log(`│  Recent Preamble: ${ctx.recentPreambleCount} chunks`);
  }
  console.log('└─────────────────────────────────────────────────────┘');
}

/**
 * Show usage help.
 */
function showHelp() {
  console.log(`
Project STFU — CLI Interface
=============================

Usage: node cli.js <command> [arguments]

Available commands:

  DISCOVERY (AFD):
    whatCanIDo                 List all available commands
    status                    Show current session status
    schema <commandName>      Show schema for a specific command

  SESSION:
    startSession              Start a new coaching session
    stopSession               Stop and save the current session
    resetSession              Reset (discard) the current session

  ANALYSIS:
    process "<text>"          Analyze a transcript chunk
    coaching                  Get current coaching message
    thresholds '<json>'       Update thresholds (JSON string)
    summary                   Get session summary

  HELP:
    help                      Show this message

Examples:
  node cli.js startSession
  node cli.js process "So basically what I was trying to say is that the fundamental issue here is really about the paradigm shift we need to make."
  node cli.js coaching
  node cli.js stopSession
  node cli.js summary
`);
}

// ============================================================================
// COMMAND ROUTING — Match the command name to the right function
// ============================================================================

async function run() {
  switch (commandName) {
    case 'whatCanIDo':
      printResult(commands.whatCanIDo());
      break;

    case 'status':
      printResult(commands.getStatus());
      break;

    case 'schema':
      if (!args[0]) {
        console.log('Usage: node cli.js schema <commandName>');
        console.log('Example: node cli.js schema startSession');
      } else {
        printResult(commands.getSchema(args[0]));
      }
      break;

    case 'startSession':
      printResult(commands.startSession());
      break;

    case 'stopSession':
      printResult(await commands.stopSession());
      break;

    case 'resetSession':
      printResult(commands.reset());
      break;

    case 'process':
      if (!args[0]) {
        console.log('Usage: node cli.js process "Your transcript text here"');
      } else {
        // Join all remaining args in case the text wasn't quoted
        const text = args.join(' ');
        printResult(commands.processTranscriptChunk(text));
      }
      break;

    case 'coaching':
      printResult(commands.getCurrentCoachingMessage());
      break;

    case 'thresholds':
      if (!args[0]) {
        console.log('Usage: node cli.js thresholds \'{"greenMax": 30}\'');
      } else {
        try {
          const config = JSON.parse(args[0]);
          printResult(commands.updateThresholds(config));
        } catch {
          console.log('Error: Could not parse JSON. Make sure to use valid JSON.');
          console.log('Example: node cli.js thresholds \'{"greenMax": 30}\'');
        }
      }
      break;

    case 'summary':
      printResult(commands.getSessionSummary());
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      if (!commandName) {
        showHelp();
      } else {
        console.log(`Unknown command: "${commandName}"`);
        console.log('Run "node cli.js help" to see available commands.');
      }
  }
}

// Run it
run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
