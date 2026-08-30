import type { ThemeId } from '../../shared/types.ts';
import { el, escapeHtml } from '../lib/dom.ts';
import { logoHtml } from './logo.ts';
import { markSvg } from './mark.ts';

/** The front of the card. Sized entirely in container units so it scales anywhere. */
export function renderCover(theme: ThemeId, recipient: string): HTMLElement {
  const cover = el('div', 'cover-art');
  cover.dataset.theme = theme;
  if (theme === 'circle') {
    cover.innerHTML = `
      <div class="cover-deco"></div>
      <div class="cover-text">
        <span class="cover-mark">${markSvg()}</span>
        <span class="cover-kicker">Happy</span>
        <span class="cover-title">Birthday</span>
        ${recipient ? `<span class="cover-for">${escapeHtml(recipient)}</span>` : ''}
      </div>
      <div class="cover-brand">${logoHtml()}</div>`;
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
