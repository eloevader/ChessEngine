#!/usr/bin/env node
/**
 * stockfish-bridge.js
 *
 * A small WebSocket-to-UCI bridge so the browser can drive a local
 * Stockfish engine over a websocket connection.
 *
 * Usage:
 *   node stockfish-bridge.js [path/to/stockfish-binary] [port]
 *
 * Defaults:
 *   binary: stockfish.exe (or stockfish on Linux/macOS) in the
 *           current directory or on PATH
 *   port:   8765
 *
 * The bridge:
 *   - spawns the Stockfish process
 *   - opens a WebSocket server on the configured port
 *   - forwards any UCI command sent over the websocket to Stockfish's
 *     stdin
 *   - forwards any line Stockfish writes to stdout back to the
 *     websocket client
 *
 * This is what the chess app expects: open a WebSocket to
 * ws://localhost:8765, send "uci\n", receive the "uciok" reply, then
 * "isready\n" → "readyok\n", then "position fen ...\n" + "go ...\n"
 * and receive "info ..." / "bestmove ..." lines.
 *
 * To expose a Stockfish binary that is NOT on PATH, pass it as the
 * first argument, e.g.:
 *   node stockfish-bridge.js "C:\path\to\stockfish.exe"
 *
 * No dependencies — uses only Node.js built-ins.
 */

const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const explicitBinary = args[0] && !/^\d+$/.test(args[0]) ? args[0] : null;
const port = parseInt(
  args.find((a) => /^\d+$/.test(a)) ?? '8765',
  10,
);

function findStockfish() {
  if (explicitBinary) {
    if (fs.existsSync(explicitBinary)) return explicitBinary;
    console.error(`[bridge] Binary not found: ${explicitBinary}`);
    process.exit(1);
  }
  const isWin = os.platform() === 'win32';
  const candidates = isWin
    ? [
        path.join(process.cwd(), 'stockfish.exe'),
        path.join(process.cwd(), 'stockfish', 'stockfish.exe'),
        path.join(process.cwd(), 'engine', 'stockfish.exe'),
      ]
    : [
        path.join(process.cwd(), 'stockfish'),
        path.join(process.cwd(), 'stockfish.exe'),
        '/usr/bin/stockfish',
        '/usr/local/bin/stockfish',
        '/opt/homebrew/bin/stockfish',
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'stockfish'; // rely on PATH
}

const STOCKFISH_BIN = findStockfish();
console.log(`[bridge] Using Stockfish binary: ${STOCKFISH_BIN}`);

// --- Spawn Stockfish ---
const engine = spawn(STOCKFISH_BIN, [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

engine.on('error', (err) => {
  console.error(`[bridge] Failed to start Stockfish: ${err.message}`);
  console.error(
    '[bridge] Make sure Stockfish is installed and either on PATH or passed as the first argument.',
  );
  process.exit(1);
});

engine.stderr.on('data', (chunk) => {
  process.stderr.write(`[engine] ${chunk}`);
});

let engineBuffer = '';
engine.stdout.on('data', (chunk) => {
  engineBuffer += chunk.toString('utf8');
  let idx;
  while ((idx = engineBuffer.indexOf('\n')) >= 0) {
    const line = engineBuffer.slice(0, idx).trim();
    engineBuffer = engineBuffer.slice(idx + 1);
    if (line) broadcast(line);
  }
});

engine.on('exit', (code, signal) => {
  console.log(`[bridge] Stockfish exited (code=${code} signal=${signal})`);
  process.exit(code ?? 0);
});

// --- WebSocket server (RFC 6455, no deps) ---
const clients = new Set();
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
    '',
  ].join('\r\n');
  socket.write(responseHeaders);

  const client = { socket };
  clients.add(client);

  console.log(`[bridge] Client connected (${clients.size} total)`);

  socket.on('data', (data) => {
    let offset = 0;
    while (offset < data.length) {
      const frame = parseFrame(data, offset);
      if (!frame) break;
      offset = frame.nextOffset;
      if (frame.opcode === 0x1) {
        // text frame
        const text = frame.payload.toString('utf8');
        // Forward to Stockfish, line by line
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          engine.stdin.write(line + '\n');
        }
      } else if (frame.opcode === 0x8) {
        // close
        socket.end();
        clients.delete(client);
      } else if (frame.opcode === 0x9) {
        // ping → pong
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0;
        socket.write(pong);
      }
    }
  });

  socket.on('close', () => {
    clients.delete(client);
    console.log(`[bridge] Client disconnected (${clients.size} total)`);
  });
  socket.on('error', () => {
    clients.delete(client);
  });
});

function broadcast(line) {
  for (const client of clients) {
    try {
      sendTextFrame(client.socket, line);
    } catch {
      clients.delete(client);
    }
  }
}

function sendTextFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  // Server-to-client frames must NOT have the mask bit set
  // (RFC 6455 §5.1). The 0x80 in the original code was wrong.
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = len; // MASK=0, len
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function parseFrame(data, start) {
  if (start + 2 > data.length) return null;
  const b1 = data[start];
  const b2 = data[start + 1];
  const opcode = b1 & 0x0f;
  let len = b2 & 0x7f;
  let offset = start + 2;
  if (len === 126) {
    if (offset + 2 > data.length) return null;
    len = data.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (offset + 8 > data.length) return null;
    len = Number(data.readBigUInt64BE(offset));
    offset += 8;
  }
  // client frames must be masked per spec
  if (offset + 4 > data.length) return null;
  const mask = data.slice(offset, offset + 4);
  offset += 4;
  if (offset + len > data.length) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    payload[i] = data[offset + i] ^ mask[i & 3];
  }
  return { opcode, payload, nextOffset: offset + len };
}

server.listen(port, '127.0.0.1', () => {
  console.log(`[bridge] Stockfish bridge listening on ws://localhost:${port}`);
  console.log('[bridge] Open the chess app and it will auto-connect.');
  console.log('[bridge] Press Ctrl+C to stop.');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[bridge] Shutting down...');
  try {
    engine.kill();
  } catch {}
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  try {
    engine.kill();
  } catch {}
  server.close(() => process.exit(0));
});
