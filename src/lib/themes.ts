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
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
