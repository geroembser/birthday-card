import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CardData, Stroke, ThemeId } from '../shared/types.ts';

const DATA_DIR = process.env.DATA_DIR ?? 'data';
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'cards.db'));
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

interface Row {
  id: string;
  edit_token: string;
  theme: string;
  recipient: string;
  strokes: string;
  created_at: string;
  updated_at: string;
}

const insertStmt = db.prepare(
  `INSERT INTO cards (id, edit_token, theme, recipient, strokes, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const selectStmt = db.prepare(`SELECT * FROM cards WHERE id = ?`);
const updateStmt = db.prepare(
  `UPDATE cards SET theme = ?, recipient = ?, strokes = ?, updated_at = ? WHERE id = ?`,
);

function toCard(row: Row): CardData {
  return {
    id: row.id,
    theme: row.theme as ThemeId,
    recipient: row.recipient,
    strokes: JSON.parse(row.strokes) as Stroke[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertCard(card: CardData, editToken: string): void {
  insertStmt.run(
    card.id,
    editToken,
    card.theme,
    card.recipient,
    JSON.stringify(card.strokes),
    card.createdAt,
    card.updatedAt,
  );
}

export function findCard(id: string): { card: CardData; editToken: string } | null {
  const row = selectStmt.get(id) as Row | undefined;
  if (!row) return null;
  return { card: toCard(row), editToken: row.edit_token };
}

export function saveCard(card: CardData): void {
  updateStmt.run(card.theme, card.recipient, JSON.stringify(card.strokes), card.updatedAt, card.id);
}
