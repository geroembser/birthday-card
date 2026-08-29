/**
 * Cloudflare Workers entry point.
 * - Cards live in R2, one JSON object per card (no row-size limits, free tier).
 * - The built client is served by Workers Assets; only /api/* and /c/* reach
 *   this code (see `run_worker_first` in wrangler.jsonc).
 */
import type { Hono } from 'hono';
import { CARD_PATH_RE, createApp, injectCardMeta, type CardStore, type StoredCard } from '../server/app.ts';

interface Env {
  CARDS: R2Bucket;
  ASSETS: Fetcher;
}

function r2Store(bucket: R2Bucket): CardStore {
  const key = (id: string) => `cards/${id}.json`;
  return {
    async get(id) {
      const obj = await bucket.get(key(id));
      if (!obj) return null;
      return (await obj.json()) as StoredCard;
    },
    async put(record) {
      await bucket.put(key(record.card.id), JSON.stringify(record), {
        httpMetadata: { contentType: 'application/json' },
      });
    },
  };
}

let cached: { bucket: R2Bucket; app: Hono; store: CardStore } | null = null;

function appFor(env: Env): { app: Hono; store: CardStore } {
  if (!cached || cached.bucket !== env.CARDS) {
    const store = r2Store(env.CARDS);
    cached = { bucket: env.CARDS, store, app: createApp(store) };
  }
  return cached;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { app, store } = appFor(env);

    // Shared card links: serve index.html with that card's title/OpenGraph tags.
    const m = url.pathname.match(CARD_PATH_RE);
    if (m && request.method === 'GET') {
      const indexRes = await env.ASSETS.fetch(new Request(new URL('/index.html', url), { method: 'GET' }));
      let html = await indexRes.text();
      const found = await store.get(m[1]!);
      if (found) html = injectCardMeta(html, found.card);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
