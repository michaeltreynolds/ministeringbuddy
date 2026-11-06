// Development bridge server. Relays commands from tools/bridge.mjs to the extension.
// Listens on localhost only and writes nothing to disk except its one-time token.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = 8765;
const TIMEOUT_MS = 30_000;
const ALLOWED_COMMANDS = new Set(['status', 'dom', 'fetch', 'network', 'scripts', 'embedded', 'reload', 'reload-page']);

const token = randomBytes(24).toString('hex');

let extension;
let nextId = 1;
const pending = new Map();

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const reply = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST' || request.url !== '/command') return reply(404, { ok: false, error: 'Not found.' });
  if (request.headers.authorization !== `Bearer ${token}`) return reply(401, { ok: false, error: 'Bad token.' });

  const command = JSON.parse(await readBody(request));
  if (!ALLOWED_COMMANDS.has(command.command)) return reply(400, { ok: false, error: 'Unknown command.' });
  if (extension?.readyState !== 1) return reply(503, { ok: false, error: 'The extension is not connected.' });

  const id = nextId++;
  const timer = setTimeout(() => {
    pending.delete(id);
    reply(504, { ok: false, error: 'The extension did not answer in time.' });
  }, TIMEOUT_MS);
  pending.set(id, (result) => {
    clearTimeout(timer);
    reply(200, result);
  });
  extension.send(JSON.stringify({ id, request: command }));
});

// Only the extension may connect; a web page's Origin is an https or http URL.
const sockets = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => typeof origin === 'string' && origin.startsWith('chrome-extension://'),
});

sockets.on('connection', (socket) => {
  extension = socket;
  console.log('extension connected');
  socket.on('message', (data) => {
    const message = JSON.parse(String(data));
    if (message.ping) return;
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  });
  socket.on('close', () => console.log('extension disconnected'));
});

// The token is written only once listening succeeds, so a second copy that fails to start
// can't overwrite the running server's token.
server.listen(PORT, '127.0.0.1', () => {
  writeFileSync('.bridge-token', token, { mode: 0o600 });
  console.log(`bridge listening on 127.0.0.1:${PORT}`);
});
