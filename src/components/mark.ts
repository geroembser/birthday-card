/**
 * The birthday.card mark, after my.card's logo: four viewfinder corner
 * brackets in brand blue with a soft grey balloon in the centre.
 * Renders as inline SVG; size it via CSS on the wrapper.
 */
export const MARK_BLUE = '#389eff';
export const MARK_GREY = '#d4d4d4';

export function markSvg(className = ''): string {
  const c = MARK_BLUE;
  const g = MARK_GREY;
  return `<svg class="mark ${className}" viewBox="0 0 122 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 32V14a8 8 0 0 1 8-8h18"/>
      <path d="M90 6h18a8 8 0 0 1 8 8v18"/>
      <path d="M116 90v18a8 8 0 0 1-8 8H90"/>
      <path d="M32 116H14a8 8 0 0 1-8-8V90"/>
    </g>
    <g fill="${g}">
      <path d="M61 26c15 0 25 13 25 30 0 16-11 30-25 32-14-2-25-16-25-32 0-17 10-30 25-30Z"/>
      <path d="M56.5 88h9l-4.5 7.5Z"/>
    </g>
    <path d="M61 95.5c6 5-6 9 0 14" fill="none" stroke="${g}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="52" cy="42" rx="5" ry="9" transform="rotate(20 52 42)" fill="#fff" fill-opacity=".55"/>
  </svg>`;
}
