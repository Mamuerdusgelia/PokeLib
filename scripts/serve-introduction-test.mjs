// UI acceptance harness: real AuthGate, Library, IndexedDB and styles; no Worker,
// production credentials or backend. Browser tests intercept account responses.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import fs from 'node:fs/promises';
const entry = '/.artifacts/introduction-entry.jsx';
await fs.mkdir('.artifacts', { recursive: true });
await fs.writeFile(
  '.artifacts/introduction-entry.jsx',
  `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import AuthGate from '/components/auth-gate.tsx';
  import '/app/globals.css'; import '/app/vault.css';
  import '/app/workflows.css'; import '/app/redesign.css';
  createRoot(document.getElementById('root')).render(<AuthGate />);`,
);
const server = await createServer({
  configFile: false,
  envFile: false,
  resolve: { alias: { '@': process.cwd() } },
  define: { 'process.env.POKELIB_QA': '""' },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    react(),
    {
      name: 'introduction-acceptance',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/' || req.url?.startsWith('/signin-with-chatgpt')) {
            res.setHeader('Content-Type', 'text/html');
            res.end(
              await server.transformIndexHtml(
                '/',
                `<html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`,
              ),
            );
          } else next();
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 3100, strictPort: true },
});
await server.listen();
server.printUrls();
