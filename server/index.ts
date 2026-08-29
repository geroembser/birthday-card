import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { findCard, insertCard, saveCard } from './db.ts';
import { LIMITS, THEME_IDS } from '../shared/types.ts';
import type { CardData, Stroke, ThemeId } from '../shared/types.ts';

const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === 'production';

// --- helpers ---------------------------------------------------------------

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newId(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return out;
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function isTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

function cleanRecipient(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, LIMITS.recipientLength);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Validates and normalises strokes; returns null if malformed or over limits. */
function cleanStrokes(v: unknown): Stroke[] | null {
  if (!Array.isArray(v) || v.length > LIMITS.strokes) return null;
  let totalPoints = 0;
  const out: Stroke[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object') return null;
    const { color, size, points } = s as Record<string, unknown>;
    if (typeof color !== 'string' || !COLOR_RE.test(color)) return null;
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > 200) return null;
    if (!Array.isArray(points) || points.length === 0) return null;
    totalPoints += points.length;
    if (totalPoints > LIMITS.points) return null;
    const pts = [];
    for (const p of points) {
      if (!p || typeof p !== 'object') return null;
      const { x, y, p: pressure, t } = p as Record<string, unknown>;
      if (![x, y, pressure, t].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
      pts.push({
        x: Math.round((x as number) * 10) / 10,
        y: Math.round((y as number) * 10) / 10,
        p: Math.min(1, Math.max(0, Math.round((pressure as number) * 100) / 100)),
        t: Math.max(0, Math.round(t as number)),
      });
    }
    out.push({ color, size, points: pts });
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// --- app -------------------------------------------------------------------

const app = new Hono();

const api = new Hono();
api.use('*', bodyLimit({ maxSize: LIMITS.bodyBytes }));

api.post('/cards', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  if (!isTheme(body.theme)) return c.json({ error: 'Unknown theme' }, 400);
  const now = new Date().toISOString();
  const card: CardData = {
    id: newId(),
    theme: body.theme,
    recipient: cleanRecipient(body.recipient),
    strokes: [],
    createdAt: now,
    updatedAt: now,
  };
  const editToken = newToken();
  insertCard(card, editToken);
  return c.json({ card, editToken }, 201);
});

api.get('/cards/:id', (c) => {
  const found = findCard(c.req.param('id'));
  if (!found) return c.json({ error: 'Card not found' }, 404);
  c.header('Cache-Control', 'no-store');
  return c.json(found.card);
});

api.put('/cards/:id', async (c) => {
  const found = findCard(c.req.param('id'));
  if (!found) return c.json({ error: 'Card not found' }, 404);
  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !tokensMatch(token, found.editToken)) {
    return c.json({ error: 'This card can only be edited from the device it was created on.' }, 403);
  }
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const card = found.card;
  if (body.theme !== undefined) {
    if (!isTheme(body.theme)) return c.json({ error: 'Unknown theme' }, 400);
    card.theme = body.theme;
  }
  if (body.recipient !== undefined) card.recipient = cleanRecipient(body.recipient);
  if (body.strokes !== undefined) {
    const strokes = cleanStrokes(body.strokes);
    if (!strokes) return c.json({ error: 'Malformed strokes or card is too large' }, 400);
    card.strokes = strokes;
  }
  card.updatedAt = new Date().toISOString();
  saveCard(card);
  return c.json(card);
});

app.route('/api', api);
app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));

// --- static client (production) -------------------------------------------

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
  app.get('*', (c) => {
    let html = indexHtml;
    const m = c.req.path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const found = findCard(m[1]!);
      if (found) {
        const who = found.card.recipient ? ` for ${found.card.recipient}` : '';
        const title = escapeHtml(`A birthday card${who}`);
        const desc = 'Someone handwrote you a birthday card. Tap to open it.';
        html = html
          .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
          .replace(
            '</head>',
            `<meta property="og:title" content="${title}" />` +
              `<meta property="og:description" content="${desc}" />` +
              `<meta property="og:type" content="website" />` +
              `<meta name="twitter:card" content="summary" />` +
              `</head>`,
          );
      }
    }
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Birthday Card ${PROD ? 'server' : 'API'} listening on http://localhost:${info.port}`);
});
