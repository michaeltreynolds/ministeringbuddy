// Ask the extension what it can see. Output has already been sanitized in the browser.
//   node tools/bridge.mjs status
//   node tools/bridge.mjs dom [selector]
//   node tools/bridge.mjs fetch /some/path
//   node tools/bridge.mjs network
//   node tools/bridge.mjs scripts
//   node tools/bridge.mjs embedded <index from scripts>
//   node tools/bridge.mjs next /some/page   (sanitized __NEXT_DATA__ of that page)
//   node tools/bridge.mjs reload-page
//   node tools/bridge.mjs reload
import { readFileSync } from 'node:fs';

const [command, argument] = process.argv.slice(2);
const request = { command };
if (command === 'dom' && argument) request.selector = argument;
if (command === 'fetch' || command === 'next') request.path = argument;
if (command === 'embedded') request.index = Number(argument);

const response = await fetch('http://127.0.0.1:8765/command', {
  method: 'POST',
  headers: { authorization: `Bearer ${readFileSync('.bridge-token', 'utf8')}` },
  body: JSON.stringify(request),
});
const result = await response.json();
if (result.ok) {
  console.log(result.output);
} else {
  console.error(result.findings ? `BLOCKED by the leak scan: ${JSON.stringify(result.findings)}` : result.error);
  process.exitCode = 1;
}
