import type { ThemeId } from '../../shared/types.ts';

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'confetti', name: 'Confetti', blurb: 'Warm cream, scattered colour' },
  { id: 'midnight', name: 'Midnight', blurb: 'Deep blue with gold stars' },
  { id: 'blush', name: 'Blush', blurb: 'Soft pink and balloons' },
  { id: 'botanical', name: 'Botanical', blurb: 'Sage green and leaves' },
  { id: 'circle', name: 'Circle', blurb: 'White, one bright colour' },
];

/** my.card's brand blue — the default accent for the Circle theme. */
export const CIRCLE_BLUE = '#389eff';

/** Bright, saturated accents in the spirit of my.card's random backgrounds. */
const CIRCLE_PALETTE = ['#389eff', '#ff5a7a', '#ff8a3d', '#22c98a', '#a56cff', '#ff4fd8', '#1fc3d6', '#ffb400', '#5b6cff', '#ff6b4a'];

/** A stable "random" accent per card (same id → same colour). */
export function seedColor(seed?: string): string {
  if (!seed) return CIRCLE_BLUE;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CIRCLE_PALETTE[h % CIRCLE_PALETTE.length]!;
}

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
