import type { ThemeId } from '../../shared/types.ts';

export interface Theme {
  id: ThemeId;
}

export const THEMES: readonly Theme[] = [
  { id: 'confetti' },
  { id: 'midnight' },
  { id: 'blush' },
  { id: 'botanical' },
  { id: 'circle' },
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
