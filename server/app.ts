/**
 * The Birthday Card API as a portable Hono app. Runtime-agnostic: no Node
 * imports here, only Web APIs — so the same code runs on Node (server/index.ts)
 * and Cloudflare Workers (worker/index.ts). Storage is injected via CardStore.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { LIMITS, THEME_IDS } from '../shared/types.ts';
import type { CardData, Stroke, ThemeId } from '../shared/types.ts';

export interface StoredCard {
  card: CardData;
  editToken: string;
}

export interface CardStore {
  get(id: string): Promise<StoredCard | null>;
  put(record: StoredCard): Promise<void>;
}

// --- crypto helpers (Web Crypto, available on Node >= 20 and Workers) -------

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return out;
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function newToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i]! & 63];
  return out;
}

/** Constant-time string comparison. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- validation ---------------------------------------------------------------

function isTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

function cleanRecipient(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, LIMITS.recipientLength);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Validates and normalises strokes; returns null if malformed or over limits. */
export function cleanStrokes(v: unknown): Stroke[] | null {
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

/** Rewrites index.html so a shared /c/:id link previews as that person's card. */
export function injectCardMeta(html: string, card: CardData): string {
  const who = card.recipient ? ` for ${card.recipient}` : '';
  const title = escapeHtml(`A birthday card${who}`);
  const desc = 'Someone handwrote you a birthday card. Tap to open it.';
  return html
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

export const CARD_PATH_RE = /^\/c\/([A-Za-z0-9_-]+)\/?$/;

// --- app ----------------------------------------------------------------------

export function createApp(store: CardStore): Hono {
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
    await store.put({ card, editToken });
    return c.json({ card, editToken }, 201);
  });

  api.get('/cards/:id', async (c) => {
    const found = await store.get(c.req.param('id'));
    if (!found) return c.json({ error: 'Card not found' }, 404);
    c.header('Cache-Control', 'no-store');
    return c.json(found.card);
  });

  api.put('/cards/:id', async (c) => {
    const found = await store.get(c.req.param('id'));
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
    await store.put({ card, editToken: found.editToken });
    return c.json(card);
  });

  api.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.route('/api', api);
  return app;
}
