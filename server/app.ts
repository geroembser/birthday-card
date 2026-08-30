/**
 * The Birthday Card API as a portable Hono app. Runtime-agnostic: no Node
 * imports here, only Web APIs — so the same code runs on Node (server/index.ts)
 * and Cloudflare Workers (worker/index.ts). Storage is injected via CardStore.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { IMAGE_TYPES, LIMITS, PAGE_H, SPREAD_W, THEME_IDS } from '../shared/types.ts';
import type { CardData, CardImage, SaveResponse, Stroke, ThemeId } from '../shared/types.ts';

export interface StoredCard {
  card: CardData;
  editToken: string;
}

export interface StoredImage {
  body: ReadableStream | Uint8Array;
  contentType: string;
}

export interface CardStore {
  get(id: string): Promise<StoredCard | null>;
  put(record: StoredCard): Promise<void>;
  putImage(cardId: string, imageId: string, data: Uint8Array, contentType: string): Promise<void>;
  getImage(cardId: string, imageId: string): Promise<StoredImage | null>;
  deleteImage(cardId: string, imageId: string): Promise<void>;
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

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

function cleanRecipient(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, LIMITS.recipientLength);
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Validates and normalises strokes; returns null if malformed or over limits. */
export function cleanStrokes(v: unknown, existingPoints = 0, existingStrokes = 0): Stroke[] | null {
  if (!Array.isArray(v) || v.length + existingStrokes > LIMITS.strokes) return null;
  let totalPoints = existingPoints;
  const out: Stroke[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object') return null;
    const { color, size, points } = s as Record<string, unknown>;
    if (typeof color !== 'string' || !COLOR_RE.test(color)) return null;
    if (!finite(size) || size <= 0 || size > 200) return null;
    if (!Array.isArray(points) || points.length === 0) return null;
    totalPoints += points.length;
    if (totalPoints > LIMITS.points) return null;
    const pts = [];
    for (const p of points) {
      if (!p || typeof p !== 'object') return null;
      const { x, y, p: pressure, t } = p as Record<string, unknown>;
      if (!finite(x) || !finite(y) || !finite(pressure) || !finite(t)) return null;
      pts.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        p: Math.min(1, Math.max(0, Math.round(pressure * 100) / 100)),
        t: Math.max(0, Math.round(t)),
      });
    }
    out.push({ color, size, points: pts });
  }
  return out;
}

/** Validates image placements. Only ids already uploaded to this card are allowed. */
function cleanImages(v: unknown, known: CardImage[]): CardImage[] | null {
  if (!Array.isArray(v) || v.length > LIMITS.images) return null;
  const knownIds = new Set(known.map((i) => i.id));
  const seen = new Set<string>();
  const out: CardImage[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return null;
    const { id, x, y, w, h, t } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !knownIds.has(id) || seen.has(id)) return null;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || !finite(t)) return null;
    if (w <= 0 || h <= 0 || w > SPREAD_W * 2 || h > PAGE_H * 2) return null;
    seen.add(id);
    out.push({
      id,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      t: Math.max(0, Math.round(t)),
    });
  }
  return out;
}

function countPoints(strokes: Stroke[]): number {
  let n = 0;
  for (const s of strokes) n += s.points.length;
  return n;
}

/** Cards written before images existed lack the field. */
export function normalizeCard(card: CardData): CardData {
  if (!Array.isArray(card.images)) card.images = [];
  return card;
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

function ack(card: CardData): SaveResponse {
  return { id: card.id, updatedAt: card.updatedAt, strokeCount: card.strokes.length };
}

function authorized(c: Context, record: StoredCard): boolean {
  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(token) && tokensMatch(token, record.editToken);
}

const FORBIDDEN = { error: 'This card can only be edited from the device it was created on.' };

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createApp(store: CardStore): Hono {
  const app = new Hono();
  const api = new Hono();
  api.use('*', bodyLimit({ maxSize: LIMITS.bodyBytes }));

  api.post('/cards', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);
    if (!isTheme(body.theme)) return c.json({ error: 'Unknown theme' }, 400);
    const now = new Date().toISOString();
    const card: CardData = {
      id: newId(),
      theme: body.theme,
      recipient: cleanRecipient(body.recipient),
      strokes: [],
      images: [],
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
    return c.json(normalizeCard(found.card));
  });

  // Partial update: any subset of theme / recipient / strokes (full replace) / images (placements).
  api.put('/cards/:id', async (c) => {
    const found = await store.get(c.req.param('id'));
    if (!found) return c.json({ error: 'Card not found' }, 404);
    if (!authorized(c, found)) return c.json(FORBIDDEN, 403);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);
    const card = normalizeCard(found.card);
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
    if (body.images !== undefined) {
      const images = cleanImages(body.images, card.images);
      if (!images) return c.json({ error: 'Malformed image placement' }, 400);
      card.images = images;
    }
    card.updatedAt = new Date().toISOString();
    await store.put({ card, editToken: found.editToken });
    return c.json(ack(card));
  });

  // Append strokes. Cheap for the client (only new strokes travel), safe on
  // reconnects (`after` must match the server's count, else 409 + count).
  api.post('/cards/:id/strokes', async (c) => {
    const found = await store.get(c.req.param('id'));
    if (!found) return c.json({ error: 'Card not found' }, 404);
    if (!authorized(c, found)) return c.json(FORBIDDEN, 403);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);
    const card = normalizeCard(found.card);
    if (body.after !== card.strokes.length) {
      return c.json({ error: 'Out of sync', strokeCount: card.strokes.length }, 409);
    }
    const strokes = cleanStrokes(body.strokes, countPoints(card.strokes), card.strokes.length);
    if (!strokes) return c.json({ error: 'Malformed strokes or card is too large' }, 400);
    card.strokes.push(...strokes);
    card.updatedAt = new Date().toISOString();
    await store.put({ card, editToken: found.editToken });
    return c.json(ack(card));
  });

  // Upload a photo (raw bytes) and place it. Query: x, y, w, h, t in spread units.
  api.post('/cards/:id/images', async (c) => {
    const found = await store.get(c.req.param('id'));
    if (!found) return c.json({ error: 'Card not found' }, 404);
    if (!authorized(c, found)) return c.json(FORBIDDEN, 403);
    const card = normalizeCard(found.card);
    if (card.images.length >= LIMITS.images) return c.json({ error: `At most ${LIMITS.images} photos per card` }, 400);
    const contentType = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!IMAGE_TYPES.includes(contentType)) return c.json({ error: 'Unsupported image type' }, 415);
    const q = c.req.query();
    const placement = { x: Number(q.x), y: Number(q.y), w: Number(q.w), h: Number(q.h), t: Number(q.t) };
    if (!Object.values(placement).every(Number.isFinite) || placement.w <= 0 || placement.h <= 0) {
      return c.json({ error: 'Missing placement' }, 400);
    }
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > LIMITS.imageBytes) return c.json({ error: 'Image too large' }, 413);
    const image: CardImage = { id: newId(12), ...placement };
    const cleaned = cleanImages([image], [image]);
    if (!cleaned) return c.json({ error: 'Malformed image placement' }, 400);
    await store.putImage(card.id, image.id, data, contentType);
    card.images.push(cleaned[0]!);
    card.updatedAt = new Date().toISOString();
    await store.put({ card, editToken: found.editToken });
    return c.json({ image: cleaned[0], ...ack(card) }, 201);
  });

  api.get('/cards/:id/images/:imageId', async (c) => {
    const id = c.req.param('id');
    const imageId = c.req.param('imageId');
    if (!ID_RE.test(imageId)) return c.json({ error: 'Not found' }, 404);
    const stored = await store.getImage(id, imageId);
    if (!stored) return c.json({ error: 'Not found' }, 404);
    return c.body(stored.body as ReadableStream, 200, {
      'Content-Type': stored.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  api.delete('/cards/:id/images/:imageId', async (c) => {
    const found = await store.get(c.req.param('id'));
    if (!found) return c.json({ error: 'Card not found' }, 404);
    if (!authorized(c, found)) return c.json(FORBIDDEN, 403);
    const imageId = c.req.param('imageId');
    const card = normalizeCard(found.card);
    card.images = card.images.filter((i) => i.id !== imageId);
    card.updatedAt = new Date().toISOString();
    await store.put({ card, editToken: found.editToken });
    await store.deleteImage(card.id, imageId);
    return c.json(ack(card));
  });

  api.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.route('/api', api);
  return app;
}
