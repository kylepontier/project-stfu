# Project STFU

**A self-regulation assistant for video calls.**

Project STFU helps you avoid monologuing during meetings and video calls. You paste what you just said, and it tells you whether you're talking too much, flags problematic language patterns, and gives you simple coaching messages like "wrap up" or "ask a question."

Everything runs locally on your computer. No cloud, no accounts, no tracking.

---

## Why I built this, and why I stopped

I built this as a deliberate hands-on exercise: a fully working, end-to-end tool — CLI, local server, UI, tests, the whole thing. I ran it for real across roughly 47 test sessions. Then I killed it on purpose. That decision is the point of this project.

The code works. It's clean, it's tested, and it does exactly what it was designed to do. The problem was never the implementation — it was the approach. This tool decides whether you're monologuing using keyword heuristics and word-count density thresholds. Once I had it running against real conversation, the ceiling of that model became obvious: it can't do the one thing the problem actually requires, which is real-time understanding of semantics, tone, inflection, and conversational context.

Concretely, it over-fires. A short, perfectly reasonable sentence that happens to contain a couple of trigger words gets flagged the same as an actual five-minute ramble. The heuristic has no way to tell the difference, because the difference isn't in the keywords or the word count — it's in the meaning. Doing this right wouldn't come from a better keyword list or more tuning; it would require genuine linguistic and behavioral modeling — effectively an LLM-based approach — to read what's actually being said and how.

So I stopped. Not because I ran out of runway, but because polishing a solution built on the wrong foundation is how you sink cost into something that can't reach the bar. The useful outcome here wasn't a shipped product; it was recognizing that the approach was mismatched to the problem, and making the call to kill it rather than nurse it. I'd rather be honest about that than keep adding keywords to a model that was never going to get there.

The rest of this README documents the system as it was actually built. It's a solid reference for the architecture and the AFD approach — just understand that the product itself was deliberately retired.

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

## Why This Was Stopped

Some of these were deliberate scoping choices, and would be fine to leave as-is:

- Transcript chunks are pasted manually (no mic integration)
- Speaking duration is estimated from word count, not actual timing
- Session data is only saved when you explicitly stop the session
- The UI is intentionally simple and throwaway

But one of them isn't a limitation to fix later — it's the reason the project was retired:

- **Tone and monologue detection uses keyword matching and density thresholds, not semantic understanding.** This isn't a rough first pass waiting on a better keyword list. The heuristic approach is fundamentally mismatched to the problem. Deciding whether someone is actually monologuing — versus saying something short and reasonable that happens to trip a keyword — requires understanding meaning, tone, inflection, and conversational context in real time. Keywords and word counts can't capture that, so the tool over-fires and can't be tuned into correctness.

A correct version would need genuine semantic and contextual understanding — effectively an LLM-based approach — not a refinement of this one. Recognizing that, and stopping here rather than polishing the wrong foundation, was the real outcome of the exercise.
