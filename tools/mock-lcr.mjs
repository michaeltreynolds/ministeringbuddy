// A fake LCR for development and screenshots. Every name and number here is made up.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = 8766;
const PAGE = readFileSync('tests/fixtures/unassigned-page.html', 'utf8');

const UNASSIGNED = {
  districtName: 'Elm',
  ministers: [
    { name: 'Jones, Bob', age: 68, phone: '801-555-0100', email: 'bob.jones@example.com', legacyCmisId: 3141592653 },
    { name: 'Keller, Barnaby', age: 25, phone: '801-555-0101', address: '123 N Maple Street', legacyCmisId: 2718281828 },
  ],
};

const html = `<!doctype html><html><head><title>Mock LCR</title></head><body>${PAGE}
<script>fetch('/api/ministering/unassigned?unitNumber=12345&name=Jones');</script></body></html>`;

const writes = [];

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const send = (type, body, status = 200) => {
    response.writeHead(status, { 'content-type': type });
    response.end(body);
  };
  if (request.method !== 'GET') {
    writes.push(`${request.method} ${url.pathname}`);
    return send('application/json', '{}');
  }
  if (url.pathname === '/ministering-proposed-assignments') return send('text/html', html);
  if (url.pathname === '/api/ministering/unassigned') return send('application/json', JSON.stringify(UNASSIGNED));
  if (url.pathname === '/__writes') return send('application/json', JSON.stringify(writes));
  return send('text/plain', 'not found', 404);
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock LCR on http://127.0.0.1:${PORT}/ministering-proposed-assignments`));
