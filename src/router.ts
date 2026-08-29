export type Cleanup = () => void;

export interface Route {
  pattern: RegExp;
  render: (root: HTMLElement, match: RegExpMatchArray) => Cleanup | void | Promise<Cleanup | void>;
}

let currentCleanup: Cleanup | void;
let routesRef: Route[] = [];
let rootRef: HTMLElement;
let renderToken = 0;

async function dispatch(): Promise<void> {
  const token = ++renderToken;
  if (currentCleanup) currentCleanup();
  currentCleanup = undefined;
  rootRef.replaceChildren();
  window.scrollTo(0, 0);

  const path = location.pathname;
  const route = routesRef.find((r) => r.pattern.test(path));
  if (!route) {
    rootRef.innerHTML = `<main class="page-center"><h1 class="display">Lost?</h1><p><a data-link href="/">Go home</a></p></main>`;
    return;
  }
  const match = path.match(route.pattern)!;
  const cleanup = await route.render(rootRef, match);
  // Ignore stale renders if the user navigated while an async render was in flight.
  if (token === renderToken) currentCleanup = cleanup;
  else if (cleanup) cleanup();
}

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  void dispatch();
}

export function startRouter(root: HTMLElement, routes: Route[]): void {
  rootRef = root;
  routesRef = routes;
  window.addEventListener('popstate', () => void dispatch());
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    e.preventDefault();
    navigate(a.getAttribute('href') ?? '/');
  });
  void dispatch();
}
