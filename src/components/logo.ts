/**
 * The birthday.card wordmark — Poiret One with a bigger, bolder, blue "."
 * (the my.card recipe). Sized in `em`, so set font-size on the wrapper.
 */
export function logoHtml(className = ''): string {
  return `<span class="brand ${className}" role="img" aria-label="birthday.card"><span aria-hidden="true">birthday<span class="brand-dot">.</span>card</span></span>`;
}
