import type { CardData } from '../../shared/types.ts';
import { createCard3D } from '../components/card3d.ts';
import { ApiError, getCard, imageUrl } from '../lib/api.ts';
import { $, escapeHtml, icons } from '../lib/dom.ts';
import { clearCanvas, drawAll } from '../lib/ink.ts';
import { playCard, type Page, type PageTargets, type Replay } from '../lib/replay.ts';
import { getEditToken } from '../lib/storage.ts';
import { seedColor } from '../lib/themes.ts';
import { logoHtml } from '../components/logo.ts';
import { createViewport, type View, type Viewport } from '../lib/viewport.ts';
import type { Cleanup } from '../router.ts';

/** Below this rendered page width the replay zooms in on the page being written. */
const AUTO_FOCUS_PAGE_WIDTH = 420;

export async function renderViewer(root: HTMLElement, id: string): Promise<Cleanup | void> {
  root.innerHTML = `<main class="page-center"><p class="muted">Loading…</p></main>`;
  let card: CardData;
  try {
    card = await getCard(id);
  } catch (err) {
    const notFound = err instanceof ApiError && err.status === 404;
    root.innerHTML = `
      <main class="page-center">
        <h1 class="display">${notFound ? 'This card doesn’t exist' : 'Couldn’t load the card'}</h1>
        <p class="lead">${notFound ? 'Check the link you were sent — or make a card of your own.' : 'Please try again in a moment.'}</p>
        <p><a class="btn primary" data-link href="/">Make a card</a></p>
      </main>`;
    return;
  }
  card.images ??= [];

  document.title = card.recipient ? `A birthday card for ${card.recipient}` : 'A birthday card';
  const isOwner = Boolean(getEditToken(card.id));
  const hasContent = card.strokes.length > 0 || card.images.length > 0;

  const view = document.createElement('div');
  view.className = 'viewer';
  view.dataset.theme = card.theme;
  view.style.setProperty('--seed', seedColor(card.id));
  view.innerHTML = `
    <div class="viewer-stage"></div>
    <p class="tap-hint">Tap to open</p>
    <p class="skip-hint" hidden>Tap to skip</p>
    <div class="viewer-footer" hidden>
      <button type="button" class="btn ghost small" id="replay">${icons.replay} Watch again</button>
      ${isOwner ? `<a class="btn ghost small" data-link href="/edit/${card.id}">${icons.pencil} Edit</a>` : ''}
      <a class="btn small" data-link href="/">Make your own card</a>
      <a class="brand-link viewer-brand" data-link href="/" aria-label="birthday.card home">${logoHtml('brand-sm')}</a>
    </div>`;
  root.replaceChildren(view);

  const card3d = createCard3D(card.theme, card.recipient);
  const scene = card3d.el;
  $(view, '.viewer-stage').append(scene);
  card3d.setImages(card.images, (img) => imageUrl(card.id, img.id));
  const hintEl = $(view, '.tap-hint');
  const skipHint = $(view, '.skip-hint');
  const footer = $(view, '.viewer-footer');

  let pages: PageTargets[] = card3d.layout();
  let replay: Replay | null = null;
  let finished = false;
  let opened = false;
  let userZoomed = false;
  let viewport: Viewport | null = null;

  // --- zoom & pan (enabled once the card is open) ------------------------------
  function createZoom(): Viewport {
    const vp = createViewport({
      el: scene,
      content: () => {
        const { w, h } = card3d.pageSize();
        return { x: -w, y: -h / 2, w: 2 * w, h };
      },
      fit: () => ({ k: 1, tx: scene.clientWidth / 2, ty: scene.clientHeight / 2 }),
      maxZoom: 5,
      mousePan: true,
      doubleTapZoom: true,
      doubleClickZoom: true,
      onChange: (v) => {
        card3d.zoomer.style.transform = `translate(${v.tx - scene.clientWidth / 2}px, ${v.ty - scene.clientHeight / 2}px) scale(${v.k})`;
      },
      onUserGesture: () => {
        userZoomed = true;
      },
    });
    return vp;
  }

  const autoFocus = () => card3d.pageSize().w < AUTO_FOCUS_PAGE_WIDTH && !userZoomed;

  function focusView(page: Page): View {
    const vp = viewport!;
    if (page === 'both') return vp.fitView;
    const { w: pw, h: ph } = card3d.pageSize();
    const cw = scene.clientWidth;
    const ch = scene.clientHeight;
    const k = Math.min(cw / (pw * 1.08), ch / (ph * 1.08), vp.fitView.k * 3);
    const cx = page === 'left' ? -pw / 2 : pw / 2;
    return { k, tx: cw / 2 - k * cx, ty: ch / 2 };
  }

  // --- replay --------------------------------------------------------------------
  function showFinal(): void {
    for (const p of pages) {
      clearCanvas(p.main);
      clearCanvas(p.wet);
      drawAll(p.main, card.strokes, p.offsetX);
    }
    card3d.showAllImages();
  }

  function endReplay(): void {
    replay = null;
    finished = true;
    skipHint.hidden = true;
    footer.hidden = false;
    if (viewport) {
      viewport.zoomOnDoubleTap = true;
      if (autoFocus()) viewport.reset(900);
    }
  }

  function play(): void {
    replay?.cancel();
    finished = false;
    footer.hidden = true;
    userZoomed = false;
    for (const p of pages) {
      clearCanvas(p.main);
      clearCanvas(p.wet);
    }
    card3d.hideAllImages();
    if (viewport) {
      viewport.zoomOnDoubleTap = false;
      viewport.reset(400);
    }
    skipHint.hidden = false;
    const r = playCard(card, pages, {
      onPage: (page) => {
        if (viewport && autoFocus()) viewport.setView(focusView(page), 900);
      },
      onImage: (img) => card3d.showImage(img.id),
      onDone: () => {
        if (replay === r) endReplay();
      },
    });
    replay = r;
  }

  async function openCard(): Promise<void> {
    if (opened) return;
    opened = true;
    hintEl.classList.add('gone');
    await card3d.open();
    viewport = createZoom();
    await new Promise((r) => setTimeout(r, 250));
    if (!hasContent) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.innerHTML = isOwner
        ? `Nothing written yet — <a data-link href="/edit/${card.id}">write your message</a>.`
        : `${card.recipient ? escapeHtml(card.recipient) + ', this' : 'This'} card is still blank.`;
      view.append(empty);
      finished = true;
      footer.hidden = false;
      return;
    }
    play();
  }

  function onTap(): void {
    if (!opened) {
      void openCard();
    } else if (replay) {
      replay.skip();
    }
  }

  // --- pointer routing: taps open/skip, touches & mouse drags navigate ---------------
  let tapStart: { id: number; x: number; y: number; t: number } | null = null;
  scene.addEventListener('pointerdown', (e) => {
    const consumed = viewport?.pointerDown(e) ?? false;
    if (!consumed && e.pointerType === 'mouse' && e.button !== 0) return;
    tapStart = viewport?.gesturing && tapStart ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  scene.addEventListener('pointermove', (e) => {
    viewport?.pointerMove(e);
    if (tapStart && e.pointerId === tapStart.id && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 10) tapStart = null;
  });
  const onUp = (e: PointerEvent) => {
    viewport?.pointerUp(e);
    if (tapStart && e.pointerId === tapStart.id) {
      const quick = performance.now() - tapStart.t < 400;
      tapStart = null;
      if (quick && e.type === 'pointerup') onTap();
    }
  };
  scene.addEventListener('pointerup', onUp);
  scene.addEventListener('pointercancel', onUp);
  hintEl.addEventListener('click', () => void openCard());
  $(view, '#replay').addEventListener('click', () => play());

  // --- resize -------------------------------------------------------------------------
  const ro = new ResizeObserver(() => {
    pages = card3d.layout(); // resizing clears the canvases
    if (replay) {
      replay.cancel();
      showFinal();
      endReplay();
    } else if (finished) {
      showFinal();
    }
    viewport?.refit();
  });
  ro.observe(scene);

  return () => {
    ro.disconnect();
    replay?.cancel();
    viewport?.destroy();
  };
}
