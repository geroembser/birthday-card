/** Device-local knowledge: which cards this device authored (and their edit tokens). */

export interface MyCard {
  id: string;
  recipient: string;
  theme: string;
  createdAt: string;
}

const TOKEN_PREFIX = 'bc:token:';
const MINE_KEY = 'bc:mine';
const PEN_KEY = 'bc:penSeen';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the app still works, it just forgets */
  }
}

export function getEditToken(id: string): string | null {
  return read<string | null>(TOKEN_PREFIX + id, null);
}

export function rememberCard(card: MyCard, editToken: string): void {
  write(TOKEN_PREFIX + card.id, editToken);
  const mine = listMyCards().filter((c) => c.id !== card.id);
  mine.unshift(card);
  write(MINE_KEY, mine.slice(0, 50));
}

export function updateMyCard(id: string, patch: Partial<MyCard>): void {
  write(
    MINE_KEY,
    listMyCards().map((c) => (c.id === id ? { ...c, ...patch } : c)),
  );
}

export function listMyCards(): MyCard[] {
  return read<MyCard[]>(MINE_KEY, []);
}

export function penSeen(): boolean {
  return read<boolean>(PEN_KEY, false);
}

export function setPenSeen(): void {
  write(PEN_KEY, true);
}
