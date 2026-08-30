import type { ThemeId } from '../../shared/types.ts';
import { el, escapeHtml } from '../lib/dom.ts';
import { seedColor } from '../lib/themes.ts';

/** The front of the card. Sized entirely in container units so it scales anywhere. */
export function renderCover(theme: ThemeId, recipient: string, seed?: string): HTMLElement {
  const cover = el('div', 'cover-art');
  cover.dataset.theme = theme;
  if (theme === 'circle') {
    cover.style.setProperty('--orb', seedColor(seed));
    const initial = recipient.trim() ? escapeHtml(recipient.trim()[0]!.toUpperCase()) : '';
    cover.innerHTML = `
      <div class="cover-deco"></div>
      <div class="cover-text">
        <span class="orb-wrap"><span class="orb ${initial ? '' : 'orb-empty'}">${initial}</span></span>
        <span class="cover-kicker">Happy</span>
        <span class="cover-title">Birthday</span>
        ${recipient ? `<span class="cover-for">${escapeHtml(recipient)}</span>` : ''}
      </div>`;
    return cover;
  }
  cover.innerHTML = `
    <div class="cover-deco"></div>
    <div class="cover-text">
      <span class="cover-kicker">Happy</span>
      <span class="cover-title">Birthday</span>
      ${recipient ? `<span class="cover-for">for ${escapeHtml(recipient)}</span>` : ''}
    </div>`;
  return cover;
}
