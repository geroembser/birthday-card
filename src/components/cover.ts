import type { ThemeId } from '../../shared/types.ts';
import { el, escapeHtml } from '../lib/dom.ts';
import { logoHtml } from './logo.ts';
import { markSvg } from './mark.ts';

const classicPatternSvg = () => `
  <svg class="classic-pattern" viewBox="0 0 500 700" preserveAspectRatio="none" focusable="false">
    <g class="classic-vines">
      <path d="M-25 112C34 34 106 48 126 116s-25 119-91 143c-54 20-60 82-5 108" />
      <path d="M13 78c39 13 64 41 68 83s-18 77-64 93M67 52c4 38 22 58 61 66M18 315c48-33 102-24 127 18s7 93-39 121c-52 31-62 95-25 143" />
      <path d="M525 72c-67-35-126-14-144 45s20 107 84 132c58 23 63 86 8 116" />
      <path d="M492 38c-45 20-69 54-65 99s26 75 76 94M447 83c-31 4-54 23-65 56M516 324c-60-28-112-10-130 40s8 91 61 119c49 26 52 89 9 132" />
      <path d="M-12 674c65-76 139-76 175-13M512 660c-62-67-137-66-173 3M117 711c-7-58 18-98 68-118M388 708c6-62-19-101-69-122" />
      <path d="M162-16c-7 54 16 94 67 118s63 71 42 119M344-14c7 52-14 91-61 116s-60 70-42 116" />
      <path d="M57 389c32-29 66-31 96-4s59 24 82-8M441 394c-33-30-69-31-99-4s-59 24-82-7" />
      <path d="M98 192c-31-17-47-5-35 19s1 39-27 31M402 188c31-17 48-5 36 19s-1 39 27 31" />
      <path d="M128 515c29-17 51-7 48 18s15 36 42 25M371 513c-28-17-50-8-47 17s-15 37-42 26" />
      <path d="M206 72c-29 3-40 20-23 36s10 34-15 40M294 70c29 3 40 20 23 36s-10 34 15 40" />
      <path d="M222 638c-31-4-45-23-27-40s10-36-18-43M278 636c31-4 45-23 27-40s-10-36 18-43" />
    </g>
    <g class="classic-leaves">
      <path d="M61 91q19-18 27-3-11 18-27 3ZM91 139q18-15 25 0-13 15-25 0ZM72 222q-19-15-25 1 13 15 25-1ZM34 344q19-18 27-2-11 17-27 2ZM91 392q19-13 24 3-14 13-24-3ZM111 477q-20-13-25 3 15 13 25-3ZM87 552q18-17 26-1-12 16-26 1Z" />
      <path d="M439 90q-19-18-27-3 11 18 27 3ZM409 139q-18-15-25 0 13 15 25 0ZM428 222q19-15 25 1-13 15-25-1ZM466 344q-19-18-27-2 11 17 27 2ZM409 392q-19-13-24 3 14 13 24-3ZM389 477q20-13 25 3-15 13-25-3ZM413 552q-18-17-26-1 12 16 26 1Z" />
      <path d="M178 48q18-16 25-1-12 16-25 1ZM217 94q-20-12-24 4 15 12 24-4ZM322 47q-18-16-25-1 12 16 25 1ZM283 94q20-12 24 4-15 12-24-4Z" />
      <path d="M151 640q17-17 25-2-11 17-25 2ZM188 598q-19-12-23 4 14 12 23-4ZM349 640q-17-17-25-2 11 17 25 2ZM312 598q19-12 23 4-14 12-23-4Z" />
      <path d="M146 365q-18-14-24 2 14 14 24-2ZM354 369q18-14 24 2-14 14-24-2ZM174 535q17-16 24-1-11 16-24 1ZM326 535q-17-16-24-1 11 16 24 1Z" />
    </g>
    <g class="classic-curls">
      <path d="M25 48q20-22 31-4t-13 19M115 67q22-18 31 2t-16 16M18 281q21-20 31-1t-15 18M127 292q23-17 30 4t-18 14M40 621q23-16 29 5t-19 12" />
      <path d="M475 48q-20-22-31-4t13 19M385 67q-22-18-31 2t16 16M482 281q-21-20-31-1t15 18M373 292q-23-17-30 4t18 14M460 621q-23-16-29 5t19 12" />
      <path d="M191 18q20-20 30-1t-15 18M309 18q-20-20-30-1t15 18M202 674q19-21 30-2t-14 19M298 674q-19-21-30-2t14 19" />
    </g>
    <g class="classic-berries">
      <circle cx="38" cy="137" r="6" /><circle cx="116" cy="176" r="5" /><circle cx="50" cy="302" r="5" /><circle cx="137" cy="431" r="6" /><circle cx="62" cy="520" r="5" /><circle cx="145" cy="610" r="5" />
      <circle cx="462" cy="137" r="6" /><circle cx="384" cy="176" r="5" /><circle cx="450" cy="302" r="5" /><circle cx="363" cy="431" r="6" /><circle cx="438" cy="520" r="5" /><circle cx="355" cy="610" r="5" />
      <circle cx="220" cy="58" r="5" /><circle cx="280" cy="58" r="5" /><circle cx="232" cy="650" r="5" /><circle cx="268" cy="650" r="5" />
    </g>
    <g class="classic-flowers">
      <g transform="translate(75 105) rotate(-12)">
        <path class="classic-gold" d="M-22 6Q0 25 22 6l-4 23Q0 42-18 29Z" />
        <path class="classic-blue" d="M-29-5Q-22-33 0-13 22-33 29-5 20 20 0 14-20 20-29-5Z" />
        <path class="classic-sky" d="M-12-7Q0-21 12-7 7 9 0 11-7 9-12-7Z" />
      </g>
      <g transform="translate(430 270) rotate(15)">
        <path class="classic-gold" d="M-18 5Q0 21 18 5l-4 18Q0 34-14 23Z" />
        <path class="classic-blue" d="M-24-4Q-18-27 0-11 18-27 24-4 17 16 0 12-17 16-24-4Z" />
        <path class="classic-sky" d="M-10-6Q0-17 10-6 6 7 0 9-6 7-10-6Z" />
      </g>
      <g transform="translate(91 505) rotate(-18)">
        <path class="classic-gold" d="M-19 6Q0 23 19 6l-4 20Q0 37-15 26Z" />
        <path class="classic-blue" d="M-26-4Q-19-29 0-12 19-29 26-4 18 17 0 12-18 17-26-4Z" />
        <path class="classic-sky" d="M-10-7Q0-19 10-7 6 8 0 10-6 8-10-7Z" />
      </g>
      <g transform="translate(402 585) rotate(10)">
        <path class="classic-gold" d="M-16 5Q0 19 16 5l-3 17Q0 31-13 22Z" />
        <path class="classic-blue" d="M-22-4Q-16-24 0-10 16-24 22-4 15 14 0 10-15 14-22-4Z" />
        <path class="classic-sky" d="M-8-5Q0-15 8-5 5 6 0 8-5 6-8-5Z" />
      </g>
      <g class="classic-trefoil" transform="translate(309 118) rotate(18)">
        <path d="M0 2C-25 0-28-25-8-29 4-31 8-19 8-10 14-23 36-19 35-3 34 15 12 18 0 2Z" />
        <circle class="classic-sky" cx="4" cy="-6" r="5" />
      </g>
      <g class="classic-trefoil" transform="translate(177 583) rotate(-17)">
        <path d="M0 2C-23 0-26-23-7-27 4-29 7-18 7-9 13-21 33-18 32-3 31 14 11 16 0 2Z" />
        <circle class="classic-sky" cx="4" cy="-6" r="5" />
      </g>
      <g class="classic-trefoil small" transform="translate(450 92) rotate(23)">
        <path d="M0 2C-18 0-20-18-6-21 3-22 6-14 6-7 10-16 26-14 25-2 24 10 9 12 0 2Z" />
      </g>
      <g class="classic-trefoil small" transform="translate(44 616) rotate(-20)">
        <path d="M0 2C-18 0-20-18-6-21 3-22 6-14 6-7 10-16 26-14 25-2 24 10 9 12 0 2Z" />
      </g>
    </g>
  </svg>`;

/** The front of the card. Sized entirely in container units so it scales anywhere. */
export function renderCover(theme: ThemeId, recipient: string): HTMLElement {
  const cover = el('div', 'cover-art');
  cover.dataset.theme = theme;
  if (theme === 'classic') {
    cover.lang = 'de';
    cover.innerHTML = `
      <div class="cover-deco" aria-hidden="true">${classicPatternSvg()}</div>
      <div class="cover-text">
        <span class="classic-occasion">Zum Geburtstag</span>
        <span class="classic-motto" lang="la"><span>Ad</span><span>multos</span><span>annos</span></span>
        ${recipient ? `<span class="cover-for">Für ${escapeHtml(recipient)}</span>` : ''}
        <span class="classic-wish">Herzliche Glückwünsche</span>
      </div>`;
    return cover;
  }
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
