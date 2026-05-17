// Minimal static file server for E2E fixture tests.
// Serves tests/e2e/fixtures/ at http://127.0.0.1:PORT/fixtures/...
// Started automatically by Playwright's webServer option.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_FIXTURE_PORT ?? 7331);
const fixturesRoot = path.join(__dirname, 'fixtures');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  // Strip leading /fixtures/ if present, then resolve to the file
  const relative = urlPath.replace(/^\/fixtures\//, '');
  let filePath = path.join(fixturesRoot, relative);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${urlPath}`);
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[idle-e2e-server] fixtures at http://127.0.0.1:${PORT}/`);
});
