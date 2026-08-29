/** Node entry point: SQLite storage, serves dist/ in production. */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { CARD_PATH_RE, createApp, injectCardMeta } from './app.ts';
import { sqliteStore } from './db.ts';

const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === 'production';

const store = sqliteStore(process.env.DATA_DIR ?? 'data');
const app = createApp(store);

if (PROD) {
  if (!existsSync('dist/index.html')) {
    console.error('dist/index.html not found — run `npm run build` first.');
    process.exit(1);
  }
  const indexHtml = readFileSync('dist/index.html', 'utf8');

  app.use(
    '/*',
    serveStatic({
      root: './dist',
      onFound: (path, c) => {
        if (path.includes('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  // SPA fallback, with per-card share metadata for /c/:id links.
  app.get('*', async (c) => {
    let html = indexHtml;
    const m = c.req.path.match(CARD_PATH_RE);
    if (m) {
      const found = await store.get(m[1]!);
      if (found) html = injectCardMeta(html, found.card);
    }
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Birthday Card ${PROD ? 'server' : 'API'} listening on http://localhost:${info.port}`);
});
