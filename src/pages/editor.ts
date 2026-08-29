import type { CardData, Point, Stroke } from '../../shared/types.ts';
import { PAGE_H, SPREAD_W } from '../../shared/types.ts';
import { ApiError, getCard, updateCard } from '../lib/api.ts';
import { $, escapeHtml, icons } from '../lib/dom.ts';
import { BRUSHES, INKS, clearCanvas, drawAll, drawStrokeProgress, prepareCanvas } from '../lib/ink.ts';
import { getEditToken, penSeen, setPenSeen } from '../lib/storage.ts';
import { navigate, type Cleanup } from '../router.ts';

const AUTOSAVE_DELAY = 900;
const MIN_POINT_DISTANCE = 1.2; // spread units; drops jitter without losing shape

export async function renderEditor(root: HTMLElement, id: string): Promise<Cleanup | void> {
  document.title = 'Write your card · Birthday Card';
  const token = getEditToken(id);

  if (!token) {
    root.innerHTML = `
      <main class="page-center">
        <h1 class="display">This card lives on another device</h1>
        <p class="lead">Cards can only be edited where they were created. You can still open it.</p>
        <p><a class="btn primary" data-link href="/c/${id}">Open the card</a> <a class="btn ghost" data-link href="/">Make your own</a></p>
      </main>`;
    return;
  }

  root.innerHTML = `<main class="page-center"><p class="muted">Loading…</p></main>`;
  let card: CardData;
  try {
    card = await getCard(id);
  } catch (err) {
    const notFound = err instanceof ApiError && err.status === 404;
    root.innerHTML = `
      <main class="page-center">
        <h1 class="display">${notFound ? "This card doesn't exist" : "Couldn't load the card"}</h1>
        <p><a class="btn primary" data-link href="/">Go home</a></p>
      </main>`;
    return;
  }

  const title = card.recipient ? `Card for ${escapeHtml(card.recipient)}` : 'Your card';
  const shareUrl = `${location.origin}/c/${card.id}`;

  root.innerHTML = `
    <div class="editor">
      <header class="editor-bar">
        <a href="/" data-link class="btn ghost icon" aria-label="Home">${icons.home}</a>
        <div class="editor-title"><strong>${title}</strong><span class="editor-status" id="status">Saved</span></div>
        <div class="editor-actions">
          <button class="btn ghost" id="preview" type="button">Preview</button>
          <button class="btn primary" id="done" type="button">Done</button>
        </div>
      </header>

      <div class="editor-stage" id="stage">
        <div class="spread" id="spread">
          <canvas id="ink" aria-label="Card writing surface"></canvas>
          <div class="fold"></div>
          <p class="spread-hint" id="hint">${card.strokes.length ? '' : 'Write your message here.<br /><small>Left page, right page — it’s all yours.</small>'}</p>
        </div>
        <p class="rotate-hint">Turn your device sideways for a bigger card.</p>
      </div>

      <footer class="toolbar">
        <div class="tool-group" id="inks" role="radiogroup" aria-label="Ink colour">
          ${INKS.map((ink, i) => `<button type="button" class="swatch ${i === 0 ? 'active' : ''}" data-color="${ink.color}" style="--c:${ink.color}" aria-label="${ink.name}" aria-pressed="${i === 0}"></button>`).join('')}
        </div>
        <div class="tool-group" id="brushes" role="radiogroup" aria-label="Pen size">
          ${BRUSHES.map((b, i) => `<button type="button" class="brush ${i === 1 ? 'active' : ''}" data-size="${b.size}" aria-label="${b.name}" aria-pressed="${i === 1}"><span style="--s:${6 + b.size}px"></span></button>`).join('')}
        </div>
        <div class="tool-group">
          <button type="button" class="tool" id="undo" aria-label="Undo last stroke">${icons.undo}</button>
          <button type="button" class="tool" id="clear" aria-label="Clear the card">${icons.trash}</button>
        </div>
      </footer>

      <div class="modal" id="share" hidden>
        <div class="modal-card">
          <p class="eyebrow">Ready to send</p>
          <h2 class="display">Your card is ready</h2>
          <p class="muted">Anyone with this link can open it and watch your handwriting appear. Only this device can change it.</p>
          <div class="link-box"><span class="link-text">${shareUrl}</span><button type="button" class="btn small" id="copy">Copy</button></div>
          <div class="modal-actions">
            <button type="button" class="btn primary" id="native-share" hidden>Share…</button>
            <a class="btn" data-link href="/c/${card.id}">Open the card</a>
            <button type="button" class="btn ghost" id="close-share">Keep writing</button>
          </div>
        </div>
      </div>
    </div>`;

  // --- state ---------------------------------------------------------------
  const strokes: Stroke[] = card.strokes;
  let color: string = INKS[0].color;
  let size: number = BRUSHES[1].size;

  const stage = $(root, '#stage');
  const spread = $(root, '#spread');
  const canvas = $<HTMLCanvasElement>(root, '#ink');
  const hint = $(root, '#hint');
  const status = $(root, '#status');
  let ctx = canvas.getContext('2d')!;

  // --- layout --------------------------------------------------------------
  function layout(): void {
    const pad = 12;
    const availW = Math.max(100, stage.clientWidth - pad * 2);
    const availH = Math.max(100, stage.clientHeight - pad * 2);
    const scale = Math.min(availW / SPREAD_W, availH / PAGE_H);
    const w = Math.floor(SPREAD_W * scale);
    const h = Math.floor(PAGE_H * scale);
    spread.style.width = `${w}px`;
    spread.style.height = `${h}px`;
    ctx = prepareCanvas(canvas, SPREAD_W, PAGE_H, w, h);
    redraw();
  }

  function redraw(): void {
    clearCanvas(ctx, SPREAD_W, PAGE_H);
    drawAll(ctx, strokes, 0);
    hint.hidden = strokes.length > 0;
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  layout();

  // --- recording clock -----------------------------------------------------
  // New strokes continue after the existing recording so replays stay ordered.
  let timeOrigin: number | null = null;
  function nowT(): number {
    if (timeOrigin === null) {
      const last = strokes.length ? strokes[strokes.length - 1]!.points.at(-1)!.t : 0;
      timeOrigin = performance.now() - (strokes.length ? last + 800 : 0);
    }
    return Math.max(0, Math.round(performance.now() - timeOrigin));
  }

  // --- pointer capture -----------------------------------------------------
  let penMode = penSeen();
  interface Active {
    pointerId: number;
    stroke: Stroke;
    drawn: number;
    pressure: number;
    rect: DOMRect;
    lastT: number;
  }
  let active: Active | null = null;

  function accepts(e: PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      if (!penMode) {
        penMode = true;
        setPenSeen();
      }
      return true;
    }
    if (e.pointerType === 'touch') return !penMode && e.isPrimary; // palm rejection once a pencil was seen
    return (e.buttons & 1) === 1; // mouse: left button only
  }

  function pressureOf(e: PointerEvent, prev: number): number {
    if (e.pointerType !== 'pen') return 0.5;
    const raw = Math.min(1, Math.max(0.05, e.pressure || 0.5));
    return prev * 0.55 + raw * 0.45;
  }

  function addPoint(a: Active, e: PointerEvent): void {
    const x = ((e.clientX - a.rect.left) / a.rect.width) * SPREAD_W;
    const y = ((e.clientY - a.rect.top) / a.rect.height) * PAGE_H;
    const pts = a.stroke.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < MIN_POINT_DISTANCE) return;
    a.pressure = pressureOf(e, a.pressure);
    const t = Math.max(a.lastT, nowT());
    a.lastT = t;
    const p: Point = {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      p: Math.round(a.pressure * 100) / 100,
      t,
    };
    pts.push(p);
  }

  function onDown(e: PointerEvent): void {
    if (active || !accepts(e)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    active = {
      pointerId: e.pointerId,
      stroke: { color, size, points: [] },
      drawn: 0,
      pressure: e.pointerType === 'pen' ? Math.min(1, Math.max(0.05, e.pressure || 0.5)) : 0.5,
      rect: canvas.getBoundingClientRect(),
      lastT: 0,
    };
    addPoint(active, e);
    hint.hidden = true;
  }

  function onMove(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (events.length) for (const ce of events) addPoint(active, ce);
    else addPoint(active, e);
    active.drawn = drawStrokeProgress(ctx, active.stroke, active.drawn, active.stroke.points.length, false, 0);
  }

  function onUp(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    if (e.type === 'pointerup') addPoint(active, e);
    const s = active.stroke;
    if (s.points.length) {
      drawStrokeProgress(ctx, s, active.drawn, s.points.length, true, 0);
      strokes.push(s);
      markDirty();
    }
    active = null;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- tools ---------------------------------------------------------------
  function selectIn(group: HTMLElement, target: HTMLElement): void {
    group.querySelectorAll('button').forEach((b) => {
      const on = b === target;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  const inks = $(root, '#inks');
  inks.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-color]');
    if (!b) return;
    color = b.dataset.color!;
    selectIn(inks, b);
  });
  const brushes = $(root, '#brushes');
  brushes.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-size]');
    if (!b) return;
    size = Number(b.dataset.size);
    selectIn(brushes, b);
  });
  $(root, '#undo').addEventListener('click', () => {
    if (!strokes.length) return;
    strokes.pop();
    redraw();
    markDirty();
  });
  $(root, '#clear').addEventListener('click', () => {
    if (!strokes.length) return;
    if (!confirm('Clear everything you wrote on this card?')) return;
    strokes.length = 0;
    redraw();
    markDirty();
  });

  // --- saving --------------------------------------------------------------
  let dirty = false;
  let saving = false;
  let saveTimer = 0;

  function setStatus(text: string, kind: '' | 'busy' | 'error' = ''): void {
    status.textContent = text;
    status.dataset.kind = kind;
  }
  function markDirty(): void {
    dirty = true;
    setStatus('Unsaved', 'busy');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void save(), AUTOSAVE_DELAY);
  }
  async function save(): Promise<void> {
    if (saving) return;
    if (!dirty) return;
    saving = true;
    dirty = false;
    setStatus('Saving…', 'busy');
    try {
      await updateCard(card.id, token!, { strokes });
      setStatus(dirty ? 'Unsaved' : 'Saved');
    } catch (err) {
      dirty = true;
      setStatus(err instanceof ApiError && err.status === 403 ? 'Not allowed to edit' : 'Couldn’t save — retrying', 'error');
      saveTimer = window.setTimeout(() => void save(), 4000);
    } finally {
      saving = false;
      if (dirty && !saveTimer) markDirty();
    }
  }
  async function flush(): Promise<void> {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    while (dirty || saving) {
      await save();
      if (saving) await new Promise((r) => setTimeout(r, 100));
      if (dirty && !saving) {
        // save() failed; give up on blocking and let the retry timer handle it
        break;
      }
    }
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty || saving) e.preventDefault();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onBeforeUnload);

  // --- share / navigation --------------------------------------------------
  const share = $(root, '#share');
  $(root, '#done').addEventListener('click', async () => {
    share.hidden = false;
    await flush();
  });
  $(root, '#close-share').addEventListener('click', () => (share.hidden = true));
  share.addEventListener('click', (e) => {
    if (e.target === share) share.hidden = true;
  });
  const copy = $<HTMLButtonElement>(root, '#copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1500);
    } catch {
      prompt('Copy this link', shareUrl);
    }
  });
  const native = $<HTMLButtonElement>(root, '#native-share');
  if (typeof navigator.share === 'function') {
    native.hidden = false;
    native.addEventListener('click', () => {
      void navigator
        .share({ title: card.recipient ? `A birthday card for ${card.recipient}` : 'A birthday card', url: shareUrl })
        .catch(() => {});
    });
  }
  $(root, '#preview').addEventListener('click', async () => {
    await flush();
    navigate(`/c/${card.id}`);
  });

  return () => {
    ro.disconnect();
    window.clearTimeout(saveTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (dirty) void save();
  };
}
