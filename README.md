# Project STFU

**A self-regulation assistant for video calls.**

Project STFU helps you avoid monologuing during meetings and video calls. You paste what you just said, and it tells you whether you're talking too much, flags problematic language patterns, and gives you simple coaching messages like "wrap up" or "ask a question."

Everything runs locally on your computer. No cloud, no accounts, no tracking.

---

## Quick Start (Mac)

### Prerequisites

- **Node.js** — Download from [nodejs.org](https://nodejs.org) (click the LTS button)

### Run the UI

```bash
# Open Terminal, navigate to this folder, then run:
node server.js
```

Then open **http://localhost:3000** in your browser.

### Run via CLI (no UI needed)

```bash
node cli.js help              # See all commands
node cli.js startSession      # Start a session
node cli.js process "text"    # Analyze a transcript chunk
node cli.js coaching          # See current coaching state
node cli.js stopSession       # Stop and save the session
node cli.js summary           # See the session summary
node cli.js resetSession      # Discard the session
```

### Run the tests

```bash
node --test tests/*.test.js
```

---

## How It Works

1. **Start a session** when your video call begins
2. **Paste transcript chunks** — what you just said — into the input box
3. The app **analyzes each chunk** for:
   - How long you were probably talking (estimated from word count)
   - Whether you asked a question
   - Whether your tone sounds over-explanatory, defensive, or abstract
4. You get a **coaching state** (green / yellow / red) and a **coaching message**
5. If you keep hitting yellow/red, warnings **escalate** to be more urgent
6. When the call ends, **stop the session** to save it and see a summary

### Thresholds

| State  | Duration          | Meaning                  |
|--------|-------------------|--------------------------|
| Green  | Under 45 seconds  | You're doing fine        |
| Yellow | 45 to 90 seconds  | Getting long, wrap up    |
| Red    | Over 90 seconds   | Stop talking, let others speak |

These can be changed. See "Modifying Thresholds" below.

---

## Architecture (AFD Principles)

This project uses **AFD (Agent-Friendly Design)** principles:

### What is AFD?

AFD means building software so that any consumer — a human, a UI, a CLI, or an AI agent — can discover what the system does, understand its inputs/outputs, and use it without special knowledge. The key ideas:

1. **Self-describing**: Call `whatCanIDo()` to see all available commands
2. **Schema-driven**: Call `getSchema("commandName")` to see exact inputs/outputs
3. **Consistent responses**: Every command returns `{ success, data, message }`
4. **Logic-first**: Business logic is independent of any UI
5. **Layered separation**: Data, Logic, and UI are cleanly separated

### Layer Diagram

```
┌─────────────────────────────────────────┐
│  UI Layer (src/ui/)                     │  ← Throwaway HTML/CSS/JS
│  Talks to server.js API                 │
├─────────────────────────────────────────┤
│  Command Layer (src/commands/index.js)  │  ← THE public API
│  CLI (cli.js) and Server both use this  │
├─────────────────────────────────────────┤
│  Logic Layer (src/logic/)               │  ← Business logic modules
│  analyzer, coach, escalation, summary   │
├─────────────────────────────────────────┤
│  Data Layer (src/data/)                 │  ← Config + storage
│  defaults.js, store.js                  │
└─────────────────────────────────────────┘
```

---

## File Guide

```
project-stfu-v01/
├── cli.js                    # Command-line interface
├── server.js                 # Local web server for the UI
├── package.json              # Project config
│
├── src/
│   ├── commands/
│   │   └── index.js          # PUBLIC API — all commands live here
│   │
│   ├── data/
│   │   ├── defaults.js       # All configurable thresholds and messages
│   │   └── store.js          # In-memory + file storage
│   │
│   ├── logic/
│   │   ├── registry.js       # AFD discovery (whatCanIDo, getSchema)
│   │   ├── session.js        # Start, stop, reset sessions
│   │   ├── analyzer.js       # Text analysis (word count, tone, questions)
│   │   ├── coach.js          # Decides green/yellow/red + picks messages
│   │   ├── escalation.js     # Warning escalation logic
│   │   └── summary.js        # Session summary generator
│   │
│   └── ui/
│       ├── index.html        # The web page
│       ├── style.css         # Styles
│       └── app.js            # Browser-side JavaScript
│
├── tests/
│   ├── analyzer.test.js      # Tests for text analysis
│   ├── session.test.js       # Tests for session lifecycle
│   ├── coach.test.js         # Tests for coaching decisions
│   ├── escalation.test.js    # Tests for warning escalation
│   └── integration.test.js   # Full end-to-end scenario tests
│
└── data/
    └── sessions/             # Saved session JSON files
```

---

## Modifying Thresholds

Open `src/data/defaults.js` and change the values:

```javascript
// Make the green zone shorter (stricter)
export const THRESHOLDS = {
  greenMax: 30,    // Was 45 — now you only get 30 seconds of green
  yellowMax: 60,   // Was 90 — yellow zone starts earlier too
};
```

You can also change thresholds at runtime:

```bash
# Via CLI
node cli.js thresholds '{"greenMax": 30, "yellowMax": 60}'
```

Or add/remove keywords in the `ANALYSIS` section of `defaults.js` to change what the tone detector looks for.

---

## V1 Limitations

- Transcript chunks are pasted manually (no mic integration yet)
- Speaking duration is estimated from word count, not actual timing
- Tone detection uses simple keyword matching, not AI/ML
- Session data is only saved when you explicitly stop the session
- The UI is intentionally simple and throwaway

These are all fine for V1. The architecture is designed to make each of these easy to upgrade later.
