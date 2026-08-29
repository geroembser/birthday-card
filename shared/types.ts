/** A single sampled point of a pen stroke, in card-spread coordinates. */
export interface Point {
  x: number;
  y: number;
  /** Pressure 0..1 (smoothed). */
  p: number;
  /** Milliseconds since the card's recording began. */
  t: number;
}

export interface Stroke {
  color: string;
  /** Base brush size in spread units. */
  size: number;
  points: Point[];
}

export type ThemeId = 'confetti' | 'midnight' | 'blush' | 'botanical';

export interface CardData {
  id: string;
  theme: ThemeId;
  recipient: string;
  strokes: Stroke[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCardInput {
  theme: ThemeId;
  recipient: string;
}

export interface UpdateCardInput {
  theme?: ThemeId;
  recipient?: string;
  strokes?: Stroke[];
}

export interface CreateCardResponse {
  card: CardData;
  editToken: string;
}

/** Logical drawing surface: two facing pages, each PAGE_W x PAGE_H. */
export const PAGE_W = 1000;
export const PAGE_H = 1400;
export const SPREAD_W = PAGE_W * 2;

export const THEME_IDS: readonly ThemeId[] = ['confetti', 'midnight', 'blush', 'botanical'];

export const LIMITS = {
  recipientLength: 40,
  strokes: 6000,
  points: 400_000,
  bodyBytes: 12 * 1024 * 1024,
} as const;
