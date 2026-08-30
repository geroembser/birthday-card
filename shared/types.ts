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

/** A photo placed on the spread, under the ink. Coordinates in spread units. */
export interface CardImage {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Recording time at which it was added (drives replay order). */
  t: number;
}

export type ThemeId = 'confetti' | 'midnight' | 'blush' | 'botanical' | 'circle';

export interface CardData {
  id: string;
  theme: ThemeId;
  recipient: string;
  strokes: Stroke[];
  images: CardImage[];
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
  images?: CardImage[];
}

export interface AppendStrokesInput {
  /** Number of strokes the client believes the server already has. */
  after: number;
  strokes: Stroke[];
}

export interface CreateCardResponse {
  card: CardData;
  editToken: string;
}

/** Small acknowledgement returned by every mutation (keeps responses tiny). */
export interface SaveResponse {
  id: string;
  updatedAt: string;
  strokeCount: number;
}

/** Logical drawing surface: two facing pages, each PAGE_W x PAGE_H. */
export const PAGE_W = 1000;
export const PAGE_H = 1400;
export const SPREAD_W = PAGE_W * 2;

export const THEME_IDS: readonly ThemeId[] = ['confetti', 'midnight', 'blush', 'botanical', 'circle'];

export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const LIMITS = {
  recipientLength: 40,
  strokes: 6000,
  points: 400_000,
  images: 12,
  imageBytes: 4 * 1024 * 1024,
  bodyBytes: 12 * 1024 * 1024,
} as const;
