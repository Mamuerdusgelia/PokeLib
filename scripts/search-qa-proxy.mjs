// Local-only response delay for browser acceptance. No application instrumentation.
// Write {"delay":3000} to .artifacts/search-delay.json; set 0 for ordinary responses.
// Optional action:"backup_restore" exercises a committed restore with a lost response.
import http from 'node:http';
import fs from 'node:fs/promises';
let sequence = 0;
const server = http
  .createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const bytes = Buffer.concat(body);
    let delay = 0,
      id,
      label = 'Search';
    const config = await fs
      .readFile('.artifacts/search-delay.json', 'utf8')
      .then(JSON.parse, () => ({}));
    const action =
      config.action === 'backup_restore' ? 'backup_restore' : 'families';
    if (
      req.url === '/api/vault' &&
      JSON.parse(bytes.toString() || '{}').action === action
    ) {
      id = ++sequence;
      label = action === 'backup_restore' ? 'Backup restore' : 'Search';
      delay = Math.min(10000, Math.max(0, Number(config.delay) || 0));
      console.log(`${label} ${id} started; response delay ${delay} ms`);
      res.on('close', () => {
        if (!res.writableFinished)
          console.log(`${label} ${id} cancelled by browser`);
      });
    }
    const headers = { ...req.headers, host: 'localhost:3000' };
    if (headers.origin) headers.origin = 'http://localhost:3000';
    const upstream = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        method: req.method,
        path: req.url,
        headers,
      },
      (response) => {
        if (!delay) {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          setTimeout(() => {
            if (!res.destroyed) {
              res.writeHead(response.statusCode, response.headers);
              res.end(Buffer.concat(chunks));
            }
            console.log(`${label} ${id} delay complete`);
          }, delay),
        );
      },
    );
    upstream.on('error', () => {
      if (!res.destroyed) {
        res.writeHead(502);
        res.end('Local QA server unavailable');
      }
    });
    upstream.end(bytes);
  })
  .listen(3001, '127.0.0.1', () =>
    console.log('Search QA proxy: http://localhost:3001'),
  );
// Vite's development client also needs its ordinary HMR WebSocket.
server.on('upgrade', (req, socket, head) => {
  const upstream = http.request({
    hostname: 'localhost',
    port: 3000,
    path: req.url,
    headers: {
      ...req.headers,
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  });
  upstream.on('upgrade', (response, remote, initial) => {
    socket.write(
      `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
        Object.entries(response.headers)
          .map(([key, value]) => `${key}: ${value}\r\n`)
          .join('') +
        '\r\n',
    );
    if (initial.length) socket.write(initial);
    if (head.length) remote.write(head);
    remote.pipe(socket);
    socket.pipe(remote);
    socket.on('error', () => remote.destroy());
    remote.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
