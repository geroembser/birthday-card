import type { CardData } from '../../shared/types.ts';
import { PAGE_H, PAGE_W } from '../../shared/types.ts';
import { createCard3D } from '../components/card3d.ts';
import { ApiError, getCard } from '../lib/api.ts';
import { $, escapeHtml, icons } from '../lib/dom.ts';
import { clearCanvas, drawAll, type InkTarget } from '../lib/ink.ts';
import { playStrokes, type Replay } from '../lib/replay.ts';
import { getEditToken } from '../lib/storage.ts';
import type { Cleanup } from '../router.ts';

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

  document.title = card.recipient ? `A birthday card for ${card.recipient}` : 'A birthday card';
  const isOwner = Boolean(getEditToken(card.id));

  const view = document.createElement('div');
  view.className = 'viewer';
  view.dataset.theme = card.theme;
  view.innerHTML = `
    <div class="viewer-stage"></div>
    <p class="tap-hint">Tap to open</p>
    <div class="viewer-footer" hidden>
      <button type="button" class="btn ghost small" id="replay">${icons.replay} Watch again</button>
      ${isOwner ? `<a class="btn ghost small" data-link href="/edit/${card.id}">${icons.pencil} Edit</a>` : ''}
      <a class="btn small" data-link href="/">Make your own card</a>
    </div>`;
  root.replaceChildren(view);

  const card3d = createCard3D(card.theme, card.recipient);
  $(view, '.viewer-stage').append(card3d.el);
  const hintEl = $(view, '.tap-hint');
  const footer = $(view, '.viewer-footer');
  if (!card.strokes.length) {
    hintEl.textContent = 'Tap to open';
  }

  let targets: InkTarget[] = card3d.layout();
  let replay: Replay | null = null;
  let finished = false;

  const ro = new ResizeObserver(() => {
    targets = card3d.layout(); // resizing clears the canvases
    if (replay) {
      replay.cancel();
      replay = null;
      finished = true;
      for (const t of targets) drawAll(t.ctx, card.strokes, t.offsetX);
      footer.hidden = false;
    } else if (finished) {
      for (const t of targets) drawAll(t.ctx, card.strokes, t.offsetX);
    }
  });
  ro.observe(card3d.el);

  async function play(): Promise<void> {
    replay?.cancel();
    finished = false;
    footer.hidden = true;
    for (const t of targets) clearCanvas(t.ctx, PAGE_W, PAGE_H);
    const r = playStrokes(card.strokes, targets);
    replay = r;
    await r.done;
    if (replay !== r) return;
    replay = null;
    finished = true;
    footer.hidden = false;
  }

  let opened = false;
  async function openCard(): Promise<void> {
    if (opened) return;
    opened = true;
    hintEl.classList.add('gone');
    await card3d.open();
    await new Promise((r) => setTimeout(r, 250));
    if (!card.strokes.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.innerHTML = isOwner
        ? `Nothing written yet — <a data-link href="/edit/${card.id}">write your message</a>.`
        : `${card.recipient ? escapeHtml(card.recipient) + ', this' : 'This'} card is still blank.`;
      view.append(empty);
      footer.hidden = false;
      return;
    }
    await play();
  }

  card3d.el.addEventListener('click', () => void openCard());
  hintEl.addEventListener('click', () => void openCard());
  $(view, '#replay').addEventListener('click', () => void play());

  return () => {
    ro.disconnect();
    replay?.cancel();
  };
}
