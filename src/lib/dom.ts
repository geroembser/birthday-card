export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function $<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

const svg = (body: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  home: svg(`<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>`),
  undo: svg(`<path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/>`),
  trash: svg(`<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>`),
  replay: svg(`<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`, 18),
  pencil: svg(`<path d="m4 20 4-1L19 8l-3-3L5 16z"/><path d="m14 7 3 3"/>`, 18),
  photo: svg(`<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m21 16-5.5-5.5L7 19"/>`),
  check: svg(`<path d="m5 12 4.5 4.5L19 7"/>`),
  eraser: svg(`<path d="m7 20 12.3-12.3a2 2 0 0 0 0-2.8l-2.2-2.2a2 2 0 0 0-2.8 0L3.6 13.4a2 2 0 0 0 0 2.8L7 20Z"/><path d="M7 20h13"/><path d="m8.5 8.5 7 7"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`, 16),
};
