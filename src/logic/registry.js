// ============================================================================
// registry.js — AFD Command Registry for Project STFU
// ============================================================================
// This is the "brain directory" of the app. It holds a catalog of
// every command the app can do — what it's called, what it needs,
// and what it returns.
//
// AFD PRINCIPLE: Self-describing system. Any agent (human or AI) can call
// whatCanIDo() to discover all capabilities, and getSchema() to learn
// the exact inputs/outputs of any command. No guessing required.
//
// Think of it like a restaurant menu:
//   - whatCanIDo() = "Here's everything on the menu"
//   - getSchema('startSession') = "Here's exactly what's in that dish"
// ============================================================================

/**
 * The command catalog. Each entry describes one capability.
 *
 * Shape of a command entry:
 * {
 *   name:        string   — The function name to call
 *   description: string   — What it does in plain English
 *   category:    string   — 'session', 'analysis', 'coaching', 'system'
 *   input:       object   — What parameters it accepts
 *   output:      object   — What it returns
 *   example:     object   — An example call
 * }
 */
const COMMANDS = [
  {
    name: 'whatCanIDo',
    description: 'Lists all available commands and what they do. Start here.',
    category: 'system',
    input: { params: 'none' },
    output: { type: 'array', description: 'List of all command definitions' },
    example: { call: 'whatCanIDo()', result: '[...list of commands]' },
  },
  {
    name: 'getStatus',
    description: 'Returns the current state of the app — whether a session is active, coaching state, etc.',
    category: 'system',
    input: { params: 'none' },
    output: { type: 'object', description: 'Current session status and coaching state' },
    example: { call: 'getStatus()', result: '{ hasActiveSession: true, coachingState: "green" }' },
  },
  {
    name: 'getSchema',
    description: 'Returns the full schema (inputs and outputs) for a specific command.',
    category: 'system',
    input: {
      commandName: { type: 'string', required: true, description: 'Name of the command to describe' },
    },
    output: { type: 'object', description: 'Full command definition with input/output schemas' },
    example: { call: 'getSchema("startSession")', result: '{ name: "startSession", input: {...}, output: {...} }' },
  },
  {
    name: 'startSession',
    description: 'Starts a new coaching session. Call this at the beginning of a video call.',
    category: 'session',
    input: {
      customThresholds: {
        type: 'object',
        required: false,
        description: 'Optional custom thresholds. Example: { greenMax: 30, yellowMax: 60 }',
      },
    },
    output: { type: 'object', description: 'The new session object' },
    example: { call: 'startSession()', result: '{ success: true, data: { id: "session-123", status: "active" } }' },
  },
  {
    name: 'stopSession',
    description: 'Stops the current session and saves it to a file. Call when the video call ends.',
    category: 'session',
    input: { params: 'none' },
    output: { type: 'object', description: 'The stopped session with save path' },
    example: { call: 'stopSession()', result: '{ success: true, data: { status: "stopped" } }' },
  },
  {
    name: 'resetSession',
    description: 'Wipes the current session from memory without saving. Use to start fresh.',
    category: 'session',
    input: { params: 'none' },
    output: { type: 'object', description: 'Confirmation of reset' },
    example: { call: 'resetSession()', result: '{ success: true, message: "Session has been reset." }' },
  },
  {
    name: 'processTranscriptChunk',
    description: 'Submit a chunk of transcript text for analysis. Returns coaching state and message.',
    category: 'analysis',
    input: {
      text: {
        type: 'string',
        required: true,
        description: 'The transcript text you want analyzed. Paste what you just said.',
      },
    },
    output: {
      type: 'object',
      description: 'Analysis results including coaching state (green/yellow/red) and coaching message',
    },
    example: {
      call: 'processTranscriptChunk("So basically what I was trying to say is...")',
      result: '{ success: true, data: { coachingState: "yellow", message: "Try asking a question..." } }',
    },
  },
  {
    name: 'getCurrentCoachingMessage',
    description: 'Returns the most recent coaching message without analyzing new text.',
    category: 'coaching',
    input: { params: 'none' },
    output: { type: 'object', description: 'Current coaching state and message' },
    example: {
      call: 'getCurrentCoachingMessage()',
      result: '{ state: "yellow", message: "Getting long — consider wrapping up." }',
    },
  },
  {
    name: 'updateThresholds',
    description: 'Change the timing thresholds for the current session.',
    category: 'coaching',
    input: {
      config: {
        type: 'object',
        required: true,
        description: 'Threshold values to update. Example: { greenMax: 30, yellowMax: 60 }',
      },
    },
    output: { type: 'object', description: 'Updated thresholds' },
    example: {
      call: 'updateThresholds({ greenMax: 30 })',
      result: '{ success: true, data: { greenMax: 30, yellowMax: 90 } }',
    },
  },
  {
    name: 'getSessionSummary',
    description: 'Generates a summary of the current or most recent session with stats and tips.',
    category: 'analysis',
    input: { params: 'none' },
    output: { type: 'object', description: 'Session summary with stats, state counts, and tips' },
    example: {
      call: 'getSessionSummary()',
      result: '{ success: true, data: { totalChunks: 5, stateCounts: { green: 3, yellow: 1, red: 1 } } }',
    },
  },
];

// ============================================================================
// PUBLIC FUNCTIONS — The AFD discovery API
// ============================================================================

/**
 * whatCanIDo — List all available commands.
 *
 * This is the first thing any agent or user should call.
 * It returns a complete menu of what the app can do.
 *
 * @returns {object} AFD-style result with the command list
 */
export function whatCanIDo() {
  return {
    success: true,
    data: COMMANDS.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      category: cmd.category,
    })),
    message: `Project STFU has ${COMMANDS.length} available commands.`,
  };
}

/**
 * getSchema — Get the full definition of a specific command.
 *
 * @param {string} commandName — The name of the command to look up
 * @returns {object} AFD-style result with the full command definition
 */
export function getSchema(commandName) {
  const command = COMMANDS.find(c => c.name === commandName);

  if (!command) {
    return {
      success: false,
      data: null,
      message: `Command "${commandName}" not found. Call whatCanIDo() to see available commands.`,
    };
  }

  return {
    success: true,
    data: command,
    message: `Schema for "${commandName}".`,
  };
}
