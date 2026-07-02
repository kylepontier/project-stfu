// ============================================================================
// server.js — Tiny local server for Project STFU
// ============================================================================
// This serves the HTML/CSS/JS files and provides a simple API
// so the browser UI can call the same commands as the CLI.
//
// AFD PRINCIPLE: The server is a thin wrapper. It doesn't contain
// business logic — it just passes requests to the command layer.
//
// HOW TO RUN: node server.js
// Then open http://localhost:3000 in your browser.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as commands from './src/commands/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Map file extensions to content types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

/**
 * Handle API requests.
 * All API routes are POST /api/<commandName>
 */
async function handleAPI(req, res) {
  // Read the request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  // Parse the command name from the URL: /api/startSession → startSession
  const commandName = req.url.replace('/api/', '');

  // Parse JSON body (or empty object if no body)
  let params = {};
  if (body) {
    try {
      params = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON in request body.' }));
      return;
    }
  }

  // Route to the right command
  let result;
  try {
    switch (commandName) {
      case 'whatCanIDo':
        result = commands.whatCanIDo();
        break;
      case 'getStatus':
        result = commands.getStatus();
        break;
      case 'getSchema':
        result = commands.getSchema(params.commandName);
        break;
      case 'startSession':
        result = commands.startSession(params.customThresholds || null);
        break;
      case 'stopSession':
        result = await commands.stopSession();
        break;
      case 'resetSession':
        result = commands.reset();
        break;
      case 'processTranscriptChunk':
        result = commands.processTranscriptChunk(params.text);
        break;
      case 'getCurrentCoachingMessage':
        result = commands.getCurrentCoachingMessage();
        break;
      case 'updateThresholds':
        result = commands.updateThresholds(params.config);
        break;
      case 'getSessionSummary':
        result = commands.getSessionSummary();
        break;
      default:
        result = { success: false, message: `Unknown command: ${commandName}` };
    }
  } catch (err) {
    result = { success: false, message: `Error: ${err.message}` };
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

/**
 * Handle static file requests (HTML, CSS, JS from src/ui/).
 */
function handleStatic(req, res) {
  // Map / to /index.html
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'src', 'ui', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Create the server
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleAPI(req, res);
  } else {
    handleStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       Project STFU is running!       ║
  ║                                      ║
  ║   Open: http://localhost:${PORT}        ║
  ║   Stop: Press Ctrl+C                 ║
  ╚══════════════════════════════════════╝
  `);
});
