import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CardStore, StoredCard } from './app.ts';
import type { Stroke, ThemeId } from '../shared/types.ts';

interface Row {
  id: string;
  edit_token: string;
  theme: string;
  recipient: string;
  strokes: string;
  images: string;
  created_at: string;
  updated_at: string;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** SQLite-backed store for the Node server (one file under DATA_DIR, images alongside). */
export function sqliteStore(dataDir: string): CardStore {
  mkdirSync(dataDir, { recursive: true });
  const imagesDir = join(dataDir, 'images');
  const db = new DatabaseSync(join(dataDir, 'cards.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cards (
      id          TEXT PRIMARY KEY,
      edit_token  TEXT NOT NULL,
      theme       TEXT NOT NULL,
      recipient   TEXT NOT NULL DEFAULT '',
      strokes     TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
  const columns = (db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('images')) db.exec(`ALTER TABLE cards ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`);

  const upsert = db.prepare(
    `INSERT INTO cards (id, edit_token, theme, recipient, strokes, images, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       theme = excluded.theme, recipient = excluded.recipient, strokes = excluded.strokes,
       images = excluded.images, updated_at = excluded.updated_at`,
  );
  const select = db.prepare(`SELECT * FROM cards WHERE id = ?`);

  const imagePath = (cardId: string, imageId: string, ext: string) => join(imagesDir, cardId, `${imageId}.${ext}`);
  const findImage = (cardId: string, imageId: string): { path: string; type: string } | null => {
    if (!SAFE_ID.test(cardId) || !SAFE_ID.test(imageId)) return null;
    let names: string[];
    try {
      names = readdirSync(join(imagesDir, cardId));
    } catch {
      return null;
    }
    const name = names.find((n) => n.startsWith(`${imageId}.`));
    if (!name) return null;
    const ext = name.slice(imageId.length + 1);
    const type = TYPE_BY_EXT[ext];
    return type ? { path: join(imagesDir, cardId, name), type } : null;
  };

  return {
    async get(id) {
      const row = select.get(id) as Row | undefined;
      if (!row) return null;
      return {
        card: {
          id: row.id,
          theme: row.theme as ThemeId,
          recipient: row.recipient,
          strokes: JSON.parse(row.strokes) as Stroke[],
          images: JSON.parse(row.images ?? '[]'),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        editToken: row.edit_token,
      };
    },
    async put({ card, editToken }: StoredCard) {
      upsert.run(
        card.id,
        editToken,
        card.theme,
        card.recipient,
        JSON.stringify(card.strokes),
        JSON.stringify(card.images ?? []),
        card.createdAt,
        card.updatedAt,
      );
    },
    async putImage(cardId, imageId, data, contentType) {
      const ext = EXT[contentType];
      if (!ext || !SAFE_ID.test(cardId) || !SAFE_ID.test(imageId)) throw new Error('Bad image');
      mkdirSync(join(imagesDir, cardId), { recursive: true });
      await writeFile(imagePath(cardId, imageId, ext), data);
    },
    async getImage(cardId, imageId) {
      const found = findImage(cardId, imageId);
      if (!found) return null;
      return { body: new Uint8Array(await readFile(found.path)), contentType: found.type };
    },
    async deleteImage(cardId, imageId) {
      const found = findImage(cardId, imageId);
      if (found) await unlink(found.path).catch(() => {});
    },
  };
}
