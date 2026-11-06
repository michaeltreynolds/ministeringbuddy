// Fails if the store package contains the development bridge or asks for more than it should.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = process.argv[2] ?? '.output/chrome-mv3';
const ALLOWED_PERMISSIONS = new Set(['identity']);
const ALLOWED_HOSTS = new Set(['https://firestore.googleapis.com/*']);
const FORBIDDEN_TEXT = ['127.0.0.1', 'localhost', '8765', '8766', 'bridge-server', 'startBridge', 'bridge-reconnect', 'WebSocket(', 'ws://'];
const TEXT_FILE = /\.(js|html|css|json|map|txt)$/;

const failures = [];

const manifest = JSON.parse(readFileSync(join(BUILD, 'manifest.json'), 'utf8'));
for (const permission of manifest.permissions ?? []) {
  if (!ALLOWED_PERMISSIONS.has(permission)) failures.push(`permission not allowed: ${permission}`);
}
for (const host of manifest.host_permissions ?? []) {
  if (!ALLOWED_HOSTS.has(host)) failures.push(`host permission not allowed: ${host}`);
}

function* filesIn(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

for (const path of filesIn(BUILD)) {
  if (/bridge/i.test(path)) failures.push(`bridge file in store build: ${path}`);
  if (!TEXT_FILE.test(path)) continue;
  const content = readFileSync(path, 'utf8');
  for (const text of FORBIDDEN_TEXT) {
    if (content.includes(text)) failures.push(`"${text}" found in ${path}`);
  }
}

if (failures.length) {
  console.error(`Store build check FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('Store build check passed.');
