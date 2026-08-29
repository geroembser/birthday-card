import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CardStore, StoredCard } from './app.ts';
import type { Stroke, ThemeId } from '../shared/types.ts';

interface Row {
  id: string;
  edit_token: string;
  theme: string;
  recipient: string;
  strokes: string;
  created_at: string;
  updated_at: string;
}

/** SQLite-backed store for the Node server (one file under DATA_DIR). */
export function sqliteStore(dataDir: string): CardStore {
  mkdirSync(dataDir, { recursive: true });
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
  const upsert = db.prepare(
    `INSERT INTO cards (id, edit_token, theme, recipient, strokes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       theme = excluded.theme, recipient = excluded.recipient,
       strokes = excluded.strokes, updated_at = excluded.updated_at`,
  );
  const select = db.prepare(`SELECT * FROM cards WHERE id = ?`);

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
        card.createdAt,
        card.updatedAt,
      );
    },
  };
}
