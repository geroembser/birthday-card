import type { CardData, CardImage, Point, Stroke } from '../../shared/types.ts';
import { LIMITS, PAGE_H, PAGE_W, SPREAD_W } from '../../shared/types.ts';
import { ApiError, appendStrokes, deleteImage, getCard, imageUrl, updateCard, uploadImage } from '../lib/api.ts';
import { $, escapeHtml, icons } from '../lib/dom.ts';
import { prepareImage } from '../lib/images.ts';
import { BRUSHES, INKS, clearCanvas, drawAll, drawStrokeProgress, prepareCanvas } from '../lib/ink.ts';
import { qrSvg } from '../lib/qr.ts';
import { shapeQrSvg } from '../lib/shapeqr.ts';
import { markSvg } from '../components/mark.ts';
import { CIRCLE_BLUE, seedColor } from '../lib/themes.ts';
import { logoHtml } from '../components/logo.ts';
import { getEditToken, penSeen, setPenSeen } from '../lib/storage.ts';
import { createViewport, type View } from '../lib/viewport.ts';
import { createDebugPanel } from '../lib/debug.ts';
import { navigate, type Cleanup } from '../router.ts';
import { text } from '../lib/i18n.ts';

const AUTOSAVE_DELAY = 1200;
const MIN_POINT_DISTANCE = 2; // spread units; drops jitter without losing shape
const POSITION_SMOOTHING = 0.7; // 1 = raw; lower = smoother, laggier
const STAGE_PADDING = 14;

type Mode = 'write' | 'arrange';

export async function renderEditor(root: HTMLElement, id: string): Promise<Cleanup | void> {
  document.title = text.editor.documentTitle;
  const token = getEditToken(id);

  if (!token) {
    root.innerHTML = `
      <main class="page-center">
        <h1 class="display">${text.editor.otherDeviceTitle}</h1>
        <p class="lead">${text.editor.otherDeviceBody}</p>
        <p><a class="btn primary" data-link href="/c/${id}">${text.editor.openCard}</a> <a class="btn ghost" data-link href="/">${text.editor.makeOwn}</a></p>
      </main>`;
    return;
  }

  root.innerHTML = `<main class="page-center"><p class="muted">${text.common.loading}</p></main>`;
  let card: CardData;
  try {
    card = await getCard(id);
  } catch (err) {
    const notFound = err instanceof ApiError && err.status === 404;
    root.innerHTML = `
      <main class="page-center">
        <h1 class="display">${notFound ? text.editor.cardMissing : text.editor.loadFailed}</h1>
        <p><a class="btn primary" data-link href="/">${text.common.goHome}</a></p>
      </main>`;
    return;
  }
  card.images ??= [];
  const editToken: string = token;

  const title = card.recipient ? text.editor.cardFor(escapeHtml(card.recipient)) : text.editor.yourCard;
  const shareUrl = `${location.origin}/c/${card.id}`;

  root.innerHTML = `
    <div class="editor" data-theme="${card.theme}" style="--seed:${seedColor(card.id)}">
      <header class="editor-bar">
        <a href="/" data-link class="brand-link" aria-label="${text.common.brandHomeLabel}">${logoHtml('brand-sm')}</a>
        <div class="editor-title"><strong>${title}</strong><span class="editor-status" id="status">${text.common.saved}</span></div>
        <div class="editor-actions">
          <button class="btn ghost" id="preview" type="button">${text.editor.preview}</button>
          <button class="btn primary" id="done" type="button">${text.common.done}</button>
        </div>
      </header>

      <div class="editor-stage" id="stage">
        <div class="paper" id="paper">
          <div class="paper-images" id="paper-images"></div>
          <div class="fold"></div>
          <p class="spread-hint" id="hint">${text.editor.writeHint}<br /><small>${text.editor.writeHintDetail}</small></p>
        </div>
        <canvas id="ink" aria-label="${text.editor.writingSurface}"></canvas>
        <div class="arrange-layer" id="arrange-layer" hidden>
          <div class="img-frame" id="img-frame">
            <button type="button" class="img-delete" id="img-delete" aria-label="${text.editor.removePhoto}">${icons.trash}</button>
            <div class="img-handle" aria-hidden="true"></div>
          </div>
        </div>
        <div class="arrange-bar" id="arrange-bar" hidden>
          <span>${text.editor.arrangeInstruction}</span>
          <button type="button" class="btn small" id="arrange-done">${icons.check} ${text.common.done}</button>
        </div>
        <div class="zoom-badge" id="zoom-badge" hidden></div>
        <div class="eraser-cursor" id="eraser-cursor" hidden></div>
        <p class="rotate-hint">${text.editor.rotateHint}</p>
      </div>

      <footer class="toolbar">
        <div class="tool-group" id="inks" role="radiogroup" aria-label="${text.editor.inkColour}">
          ${INKS.map((ink, i) => `<button type="button" class="swatch ${i === 0 ? 'active' : ''}" data-color="${ink.color}" style="--c:${ink.color}" aria-label="${text.inks[ink.id]}" aria-pressed="${i === 0}"></button>`).join('')}
        </div>
        <div class="tool-group" id="brushes" role="radiogroup" aria-label="${text.editor.penSize}">
          ${BRUSHES.map((b, i) => `<button type="button" class="brush ${i === 1 ? 'active' : ''}" data-size="${b.size}" aria-label="${text.brushes[b.id]}" aria-pressed="${i === 1}"><span style="--s:${6 + b.size}px"></span></button>`).join('')}
        </div>
        <div class="tool-group">
          <button type="button" class="tool" id="photo" aria-label="${text.editor.photos}">${icons.photo}</button>
          <button type="button" class="tool" id="eraser" aria-label="${text.editor.eraser}" aria-pressed="false">${icons.eraser}</button>
          <button type="button" class="tool" id="undo" aria-label="${text.editor.undo}">${icons.undo}</button>
          <button type="button" class="tool" id="clear" aria-label="${text.editor.clearCard}">${icons.trash}</button>
        </div>
        <div class="popover" id="photo-menu" hidden>
          <button type="button" id="add-photo">${icons.photo} ${text.editor.addPhoto}</button>
          <button type="button" id="arrange-photos">${icons.pencil} ${text.editor.arrangePhotos}</button>
        </div>
      </footer>
      <input type="file" id="file" accept="image/*" hidden />

      <div class="modal" id="share" hidden>
        <div class="modal-card">
          <p class="eyebrow">${text.editor.readyEyebrow}</p>
          <h2 class="display">${text.editor.readyTitle}</h2>
          <p class="muted">${text.editor.readyBody}</p>
          <div class="share-row">
            <div class="qr" id="qr" aria-label="${text.editor.qrLabel}">${qrSvg(shareUrl, { style: 'dots', eyeColor: CIRCLE_BLUE })}</div>
            <div class="share-col">
              <div class="link-box"><span class="link-text">${shareUrl}</span><button type="button" class="btn small" id="copy">${text.editor.copy}</button></div>
              <p class="fineprint left">${text.editor.qrInstruction}</p>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn primary" id="native-share" hidden>${text.editor.share}</button>
            <a class="btn" data-link href="/c/${card.id}">${text.editor.openCard}</a>
            <button type="button" class="btn ghost" id="close-share">${text.editor.keepWriting}</button>
          </div>
        </div>
      </div>
    </div>`;

  // --- state ---------------------------------------------------------------
  const strokes: Stroke[] = card.strokes;
  const images: CardImage[] = card.images;
  let color: string = INKS[0].color;
  let size: number = BRUSHES[1].size;
  let mode: Mode = 'write';
  let tool: 'pen' | 'eraser' = 'pen';
  let selected: CardImage | null = null;
  const blobUrls = new Map<string, string>();

  const stage = $(root, '#stage');
  const paper = $(root, '#paper');
  const paperImages = $(root, '#paper-images');
  const canvas = $<HTMLCanvasElement>(root, '#ink');
  const hint = $(root, '#hint');
  const status = $(root, '#status');
  const arrangeLayer = $(root, '#arrange-layer');
  const frame = $(root, '#img-frame');
  const arrangeBar = $(root, '#arrange-bar');
  const zoomBadge = $(root, '#zoom-badge');
  let ctx = canvas.getContext('2d')!;
  let dpr = 1;
  const debug = new URLSearchParams(location.search).has('debug') ? createDebugPanel(stage) : null;
  const trace = (e: PointerEvent, note: string) =>
    debug?.log(`${e.type.padEnd(13)} ${e.pointerType}#${e.pointerId} b=${e.buttons} p=${e.pressure.toFixed(2)} ${e.isPrimary ? 'prim' : 'sec '} @${e.clientX | 0},${e.clientY | 0} ${note}`);
  let renderedView: View = { k: 1, tx: 0, ty: 0 };

  // --- viewport (zoom & pan) ------------------------------------------------
  const fitView = (): View => {
    const cw = stage.clientWidth;
    const ch = stage.clientHeight;
    const k = Math.max(0.01, Math.min((cw - STAGE_PADDING * 2) / SPREAD_W, (ch - STAGE_PADDING * 2) / PAGE_H));
    return { k, tx: (cw - SPREAD_W * k) / 2, ty: (ch - PAGE_H * k) / 2 };
  };

  const viewport = createViewport({
    el: stage,
    content: () => ({ x: 0, y: 0, w: SPREAD_W, h: PAGE_H }),
    fit: fitView,
    maxZoom: 6,
    doubleTapZoom: true,
    onChange: (v, interacting) => {
      paper.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.k})`;
      positionFrame();
      showZoomBadge(v);
      if (interacting) {
        // Cheap during the gesture: slide the already-rendered bitmap.
        const r = v.k / renderedView.k;
        canvas.style.transform = `translate(${v.tx - r * renderedView.tx}px, ${v.ty - r * renderedView.ty}px) scale(${r})`;
      } else {
        render();
      }
    },
  });

  let badgeTimer = 0;
  function showZoomBadge(v: View): void {
    const pct = Math.round((v.k / fitView().k) * 100);
    zoomBadge.textContent = `${pct}%`;
    zoomBadge.hidden = false;
    window.clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(() => (zoomBadge.hidden = true), 900);
  }

  // --- rendering -------------------------------------------------------------
  function render(): void {
    const v = viewport.view;
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.tx, dpr * v.ty);
    clearCanvas(ctx);
    drawAll(ctx, strokes, 0);
    canvas.style.transform = '';
    renderedView = v;
    hint.hidden = strokes.length > 0 || images.length > 0;
  }

  function layout(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    ctx = prepareCanvas(canvas, w, h, w, h);
    dpr = canvas.width / w;
    viewport.refit(); // -> onChange(view, false) -> render()
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  layout();

  // --- recording clock -------------------------------------------------------
  // New strokes continue after the existing recording so replays stay ordered.
  let timeOrigin: number | null = null;
  function lastRecordedT(): number {
    let t = 0;
    for (const s of strokes) t = Math.max(t, s.points[s.points.length - 1]?.t ?? 0);
    for (const i of images) t = Math.max(t, i.t);
    return t;
  }
  function nowT(): number {
    if (timeOrigin === null) {
      const last = lastRecordedT();
      timeOrigin = performance.now() - (last ? last + 800 : 0);
    }
    return Math.max(0, Math.round(performance.now() - timeOrigin));
  }

  // --- photos ----------------------------------------------------------------
  function imageSrc(img: CardImage): string {
    return blobUrls.get(img.id) ?? imageUrl(card.id, img.id);
  }

  function renderImages(): void {
    paperImages.replaceChildren();
    for (const img of images) {
      const node = document.createElement('img');
      node.className = 'paper-photo';
      node.dataset.id = img.id;
      node.alt = '';
      node.src = imageSrc(img);
      placeImageNode(node, img);
      paperImages.append(node);
    }
    hint.hidden = strokes.length > 0 || images.length > 0;
  }

  function placeImageNode(node: HTMLElement, img: CardImage): void {
    node.style.left = `${img.x}px`;
    node.style.top = `${img.y}px`;
    node.style.width = `${img.w}px`;
    node.style.height = `${img.h}px`;
  }

  function imageNode(imgId: string): HTMLElement | null {
    return paperImages.querySelector<HTMLElement>(`[data-id="${imgId}"]`);
  }

  function positionFrame(): void {
    if (!selected) return;
    const a = viewport.contentToClient(selected.x, selected.y);
    frame.style.left = `${a.x}px`;
    frame.style.top = `${a.y}px`;
    frame.style.width = `${selected.w * viewport.view.k}px`;
    frame.style.height = `${selected.h * viewport.view.k}px`;
  }

  function select(img: CardImage | null): void {
    selected = img;
    arrangeLayer.hidden = !img;
    paperImages.querySelectorAll<HTMLElement>('.paper-photo').forEach((n) => n.classList.toggle('selected', n.dataset.id === img?.id));
    positionFrame();
  }

  function setMode(m: Mode): void {
    mode = m;
    if (m === 'arrange' && tool === 'eraser') setTool('pen');
    arrangeBar.hidden = m !== 'arrange';
    stage.classList.toggle('arranging', m === 'arrange');
    if (m === 'write') select(null);
  }

  function hitImage(p: { x: number; y: number }): CardImage | null {
    for (let i = images.length - 1; i >= 0; i--) {
      const im = images[i]!;
      if (p.x >= im.x && p.x <= im.x + im.w && p.y >= im.y && p.y <= im.y + im.h) return im;
    }
    return null;
  }

  async function addPhoto(file: File): Promise<void> {
    if (images.length >= LIMITS.images) {
      setStatus(text.editor.maxPhotos(LIMITS.images), 'error');
      return;
    }
    setStatus(text.editor.addingPhoto, 'busy');
    try {
      const prep = await prepareImage(file);
      // Place it on the emptier page, comfortably sized.
      const leftCount = images.filter((i) => i.x + i.w / 2 < PAGE_W).length;
      const page = leftCount <= images.length - leftCount ? 0 : 1;
      let w = 560;
      let h = (w * prep.height) / prep.width;
      if (h > 880) {
        h = 880;
        w = (h * prep.width) / prep.height;
      }
      const placement = {
        x: Math.round(page * PAGE_W + (PAGE_W - w) / 2 + (images.length % 3) * 30),
        y: Math.round((PAGE_H - h) / 2 + (images.length % 3) * 30),
        w: Math.round(w),
        h: Math.round(h),
        t: nowT(),
      };
      const res = await withSaveLock(() => uploadImage(card.id, editToken, prep.blob, placement));
      blobUrls.set(res.image.id, prep.url);
      images.push(res.image);
      renderImages();
      setMode('arrange');
      select(res.image);
      setStatus(text.common.saved);
    } catch {
      setStatus(text.editor.addPhotoError, 'error');
    }
  }

  async function removeSelected(): Promise<void> {
    const img = selected;
    if (!img) return;
    select(null);
    const idx = images.indexOf(img);
    if (idx >= 0) images.splice(idx, 1);
    renderImages();
    setStatus(text.editor.saving, 'busy');
    try {
      await withSaveLock(() => deleteImage(card.id, editToken, img.id));
      setStatus(text.common.saved);
    } catch {
      setStatus(text.editor.removePhotoError, 'error');
    }
  }

  // --- history ------------------------------------------------------------------
  type Action =
    | { type: 'add'; stroke: Stroke }
    | { type: 'erase'; removed: { index: number; stroke: Stroke }[] }
    | { type: 'clear'; strokes: Stroke[] };
  const history: Action[] = [];
  function pushHistory(a: Action): void {
    history.push(a);
    if (history.length > 200) history.shift();
    updateUndo();
  }
  function updateUndo(): void {
    undoBtn.disabled = history.length === 0;
  }
  function undo(): void {
    const a = history.pop();
    if (!a) return;
    if (a.type === 'add') {
      const i = strokes.lastIndexOf(a.stroke);
      if (i >= 0) strokes.splice(i, 1);
    } else if (a.type === 'erase') {
      for (const r of [...a.removed].sort((x, y) => x.index - y.index)) strokes.splice(Math.min(r.index, strokes.length), 0, r.stroke);
    } else {
      strokes.push(...a.strokes);
    }
    updateUndo();
    render();
    markStrokesChanged(true);
  }

  // --- eraser ---------------------------------------------------------------------
  const ERASER_RADIUS_PX = 14; // on screen; converted to spread units at the current zoom
  const eraserCursor = $(root, '#eraser-cursor');
  const bboxCache = new WeakMap<Stroke, { x0: number; y0: number; x1: number; y1: number }>();
  function bbox(s: Stroke) {
    let b = bboxCache.get(s);
    if (!b) {
      b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const p of s.points) {
        if (p.x < b.x0) b.x0 = p.x;
        if (p.x > b.x1) b.x1 = p.x;
        if (p.y < b.y0) b.y0 = p.y;
        if (p.y > b.y1) b.y1 = p.y;
      }
      bboxCache.set(s, b);
    }
    return b;
  }
  function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx - px;
    const qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }
  /** Does the stroke pass within `r` of the segment a→b? */
  function strokeHits(s: Stroke, a: { x: number; y: number }, b: { x: number; y: number }, r: number): boolean {
    const bb = bbox(s);
    const pad = r + s.size;
    if (Math.max(a.x, b.x) < bb.x0 - pad || Math.min(a.x, b.x) > bb.x1 + pad || Math.max(a.y, b.y) < bb.y0 - pad || Math.min(a.y, b.y) > bb.y1 + pad) return false;
    const rr = (r + s.size / 2) ** 2;
    const pts = s.points;
    if (pts.length === 1) return segDist2(pts[0]!.x, pts[0]!.y, a.x, a.y, b.x, b.y) <= rr;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      // cheap and good enough: sample the eraser segment against each stroke segment's endpoints and midpoint
      if (segDist2(p.x, p.y, a.x, a.y, b.x, b.y) <= rr || segDist2(q.x, q.y, a.x, a.y, b.x, b.y) <= rr) return true;
      if (segDist2(a.x, a.y, p.x, p.y, q.x, q.y) <= rr || segDist2(b.x, b.y, p.x, p.y, q.x, q.y) <= rr) return true;
    }
    return false;
  }
  interface EraseDrag {
    pointerId: number;
    last: { x: number; y: number };
    removed: { index: number; stroke: Stroke }[];
  }
  let erase: EraseDrag | null = null;
  function eraseAlong(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const r = ERASER_RADIUS_PX / viewport.view.k;
    let changed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i]!;
      if (strokeHits(s, a, b, r)) {
        erase!.removed.push({ index: i, stroke: s });
        strokes.splice(i, 1);
        changed = true;
      }
    }
    if (changed) render();
  }
  function moveEraserCursor(e: PointerEvent): void {
    const rect = stage.getBoundingClientRect();
    eraserCursor.style.left = `${e.clientX - rect.left}px`;
    eraserCursor.style.top = `${e.clientY - rect.top}px`;
    eraserCursor.style.width = eraserCursor.style.height = `${ERASER_RADIUS_PX * 2}px`;
  }
  function startErase(e: PointerEvent): void {
    if (viewport.pinching) return;
    if (viewport.gesturing) viewport.cancelPointers();
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = viewport.clientToContent(e.clientX, e.clientY);
    erase = { pointerId: e.pointerId, last: p, removed: [] };
    moveEraserCursor(e);
    eraserCursor.hidden = false;
    eraseAlong(p, p);
    trace(e, '→ erase');
  }
  function moveErase(e: PointerEvent): void {
    if (!erase || e.pointerId !== erase.pointerId) return;
    const events = typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
    for (const ce of events) {
      const p = viewport.clientToContent(ce.clientX, ce.clientY);
      eraseAlong(erase.last, p);
      erase.last = p;
    }
    moveEraserCursor(e);
  }
  function endErase(): void {
    if (!erase) return;
    eraserCursor.hidden = true;
    if (erase.removed.length) {
      pushHistory({ type: 'erase', removed: erase.removed });
      markStrokesChanged(true);
    }
    erase = null;
  }
  function setTool(t: 'pen' | 'eraser'): void {
    tool = t;
    eraserBtn.classList.toggle('active', t === 'eraser');
    eraserBtn.setAttribute('aria-pressed', String(t === 'eraser'));
    stage.classList.toggle('erasing', t === 'eraser');
  }

  // --- pointer input ----------------------------------------------------------
  let penMode = penSeen();
  interface Active {
    pointerId: number;
    pointerType: string;
    stroke: Stroke;
    drawn: number;
    pressure: number;
    lastT: number;
    startedAt: number;
    firstEvent: PointerEvent;
  }
  let active: Active | null = null;
  let activePointers = 0;
  interface ImageDrag {
    kind: 'move' | 'resize';
    pointerId: number;
    start: { x: number; y: number };
    x0: number;
    y0: number;
    w0: number;
    h0: number;
  }
  let imageDrag: ImageDrag | null = null;

  function rawPressure(e: PointerEvent): number {
    if (e.pointerType !== 'pen') return 0.5;
    return Math.min(1, Math.max(0.12, e.pressure || 0.5));
  }

  function pressureOf(e: PointerEvent, prev: number): number {
    if (e.pointerType !== 'pen') return 0.5;
    return prev * 0.4 + rawPressure(e) * 0.6;
  }

  function addPoint(a: Active, e: { clientX: number; clientY: number } & Partial<PointerEvent>): void {
    const raw = viewport.clientToContent(e.clientX, e.clientY);
    const pts = a.stroke.points;
    const last = pts[pts.length - 1];
    // Light low-pass on position: takes the tremor out of 240 Hz samples without visible lag.
    const x = last ? last.x + (raw.x - last.x) * POSITION_SMOOTHING : raw.x;
    const y = last ? last.y + (raw.y - last.y) * POSITION_SMOOTHING : raw.y;
    if (last && Math.hypot(x - last.x, y - last.y) < MIN_POINT_DISTANCE) return;
    a.pressure = pressureOf(e as PointerEvent, a.pressure);
    const t = Math.max(a.lastT, nowT());
    a.lastT = t;
    const p: Point = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: Math.round(a.pressure * 100) / 100, t };
    pts.push(p);
  }

  function startStroke(e: PointerEvent): void {
    if (viewport.pinching) {
      trace(e, 'ignored: pinching');
      return;
    }
    if (viewport.gesturing) viewport.cancelPointers(); // a resting palm must not block the pen
    if (canvas.style.transform) render(); // settle any in-flight zoom before inking
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* Safari can refuse capture for a pointer that is already gone */
    }
    trace(e, `→ stroke #${strokes.length + 1}`);
    active = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      stroke: { color, size, points: [] },
      drawn: 0,
      pressure: rawPressure(e),
      lastT: 0,
      startedAt: performance.now(),
      firstEvent: e,
    };
    addPoint(active, e);
    hint.hidden = true;
  }

  function cancelStroke(): void {
    active = null;
    render(); // wipes the tentative ink
  }

  function finishStroke(e: PointerEvent | null): void {
    const a = active!;
    if (e?.type === 'pointerup') addPoint(a, e);
    const s = a.stroke;
    if (s.points.length) {
      drawStrokeProgress(ctx, s, a.drawn, s.points.length, true, 0);
      strokes.push(s);
      pushHistory({ type: 'add', stroke: s });
      markStrokesChanged(false);
    }
    if (e) trace(e, `✓ stroke #${strokes.length} pts=${s.points.length}`);
    active = null;
  }

  function onDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    activePointers++;
    if (e.pointerType === 'pen' && !penMode) {
      penMode = true;
      setPenSeen();
    }

    if (mode === 'arrange') {
      arrangeDown(e);
      return;
    }

    if (tool === 'eraser') {
      // Fingers still pan/pinch once a Pencil has been seen; otherwise a finger erases.
      if (e.pointerType === 'touch' && (penMode || viewport.gesturing || erase)) {
        viewport.pointerDown(e);
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!erase) startErase(e);
      return;
    }

    if (e.pointerType === 'touch') {
      if (active?.pointerType === 'pen') {
        trace(e, 'ignored: pen is down (palm)');
        return;
      }
      if (penMode) {
        trace(e, '→ pan/pinch');
        viewport.pointerDown(e);
        return;
      }
      if (active?.pointerType === 'touch') {
        // Second finger: a young stroke becomes a pinch instead.
        if (performance.now() - active.startedAt < 350 && active.stroke.points.length < 24) {
          const first = active.firstEvent;
          cancelStroke();
          viewport.pointerDown(first);
          viewport.pointerDown(e);
        }
        return;
      }
      if (viewport.gesturing) {
        viewport.pointerDown(e);
        return;
      }
      startStroke(e);
      return;
    }

    if (e.pointerType === 'pen') {
      // A stale stroke (missed pointerup) must never swallow the next one.
      if (active) {
        trace(e, `stale stroke #${strokes.length + 1} closed`);
        finishStroke(null);
      }
      startStroke(e);
      return;
    }
    if (e.button === 0 && !active) startStroke(e);
  }

  function onMove(e: PointerEvent): void {
    if (debug && active && active.stroke.points.length === 1) trace(e, 'first move');
    if (viewport.pointerMove(e)) return;
    if (mode === 'arrange') {
      arrangeMove(e);
      return;
    }
    if (erase) {
      e.preventDefault();
      moveErase(e);
      return;
    }
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (events.length) for (const ce of events) addPoint(active, ce);
    else addPoint(active, e);
    active.drawn = drawStrokeProgress(ctx, active.stroke, active.drawn, active.stroke.points.length, false, 0);
  }

  function onUp(e: PointerEvent): void {
    activePointers = Math.max(0, activePointers - 1);
    if (viewport.pointerUp(e)) {
      trace(e, 'pan/pinch end');
      if (activePointers === 0) scheduleSave();
      return;
    }
    if (mode === 'arrange') {
      arrangeUp(e);
      return;
    }
    if (erase && (e.pointerId === erase.pointerId || e.pointerType === 'pen')) {
      endErase();
      return;
    }
    if (!active) {
      trace(e, 'no active stroke');
      return;
    }
    // There is only one pen; accept its up even if the id changed under us.
    if (e.pointerId !== active.pointerId && !(e.pointerType === 'pen' && active.pointerType === 'pen')) {
      trace(e, 'other pointer');
      return;
    }
    e.preventDefault();
    finishStroke(e);
  }

  // Arrange mode: drag photos, pull the corner handle, tap elsewhere to deselect.
  function arrangeDown(e: PointerEvent): void {
    const p = viewport.clientToContent(e.clientX, e.clientY);
    if (selected) {
      const corner = viewport.contentToClient(selected.x + selected.w, selected.y + selected.h);
      const rect = stage.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (Math.hypot(lx - corner.x, ly - corner.y) < 30) {
        stage.setPointerCapture(e.pointerId);
        imageDrag = { kind: 'resize', pointerId: e.pointerId, start: p, x0: selected.x, y0: selected.y, w0: selected.w, h0: selected.h };
        return;
      }
    }
    const hit = hitImage(p);
    if (hit) {
      select(hit);
      stage.setPointerCapture(e.pointerId);
      imageDrag = { kind: 'move', pointerId: e.pointerId, start: p, x0: hit.x, y0: hit.y, w0: hit.w, h0: hit.h };
      return;
    }
    select(null);
    viewport.pointerDown(e);
  }

  function arrangeMove(e: PointerEvent): void {
    if (!imageDrag || !selected || e.pointerId !== imageDrag.pointerId) return;
    const p = viewport.clientToContent(e.clientX, e.clientY);
    const d = imageDrag;
    if (d.kind === 'move') {
      selected.x = Math.round(Math.min(SPREAD_W - 40, Math.max(40 - selected.w, d.x0 + (p.x - d.start.x))));
      selected.y = Math.round(Math.min(PAGE_H - 40, Math.max(40 - selected.h, d.y0 + (p.y - d.start.y))));
    } else {
      const w = Math.max(120, Math.min(SPREAD_W, d.w0 + (p.x - d.start.x)));
      selected.w = Math.round(w);
      selected.h = Math.round((w * d.h0) / d.w0);
    }
    const node = imageNode(selected.id);
    if (node) placeImageNode(node, selected);
    positionFrame();
  }

  function arrangeUp(e: PointerEvent): void {
    if (imageDrag && e.pointerId === imageDrag.pointerId) {
      imageDrag = null;
      markImagesChanged();
    }
  }

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);

  // iPadOS Scribble watches Pencil input in Safari and swallows quick strokes it
  // takes for handwriting aimed at a text field (WebKit bug 217430). Cancelling
  // the touch events' default keeps Scribble out; buttons are exempt so taps click.
  const keepScribbleOut = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.type === 'touchmove' || Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus')) e.preventDefault();
  };
  stage.addEventListener('touchstart', keepScribbleOut, { passive: false });
  stage.addEventListener('touchmove', keepScribbleOut, { passive: false });
  document.body.classList.add('editing');
  if (debug) {
    // Hover (Pencil in the air) — throttled — shows the pen approaching even if the down never arrives.
    let lastHover = 0;
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'pen' && e.buttons === 0 && performance.now() - lastHover > 150) {
        lastHover = performance.now();
        trace(e, 'hover');
      }
    });
    stage.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') trace(e, '');
    });
    // Document-level, capture phase: did the OS hand the contact to some other element?
    const describe = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return el?.tagName ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}` : String(t);
    };
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!stage.contains(e.target as Node)) trace(e, `DOC target=${describe(e.target)}`);
      },
      true,
    );
    document.addEventListener(
      'touchstart',
      (e) => {
        if (!stage.contains(e.target as Node)) debug.log(`touchstart     DOC touches=${e.touches.length} target=${describe(e.target)}`);
      },
      { capture: true, passive: true },
    );
    window.addEventListener('blur', () => debug.log('window blur'));
    window.addEventListener('focus', () => debug.log('window focus'));
    for (const type of ['lostpointercapture', 'gotpointercapture', 'pointerleave', 'pointerout'] as const) {
      stage.addEventListener(type, (e) => {
        if (e.pointerType !== 'touch') trace(e, '');
      });
    }
    for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
      stage.addEventListener(type, (e) => debug.log(`${type.padEnd(13)} touches=${(e as TouchEvent).touches.length}`), { passive: true });
    }
  }
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- tools ------------------------------------------------------------------
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
    setMode('write');
    setTool('pen');
  });
  const brushes = $(root, '#brushes');
  brushes.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-size]');
    if (!b) return;
    size = Number(b.dataset.size);
    selectIn(brushes, b);
    setMode('write');
    setTool('pen');
  });
  const undoBtn = $<HTMLButtonElement>(root, '#undo');
  const eraserBtn = $<HTMLButtonElement>(root, '#eraser');
  undoBtn.addEventListener('click', undo);
  eraserBtn.addEventListener('click', () => {
    setMode('write');
    setTool(tool === 'eraser' ? 'pen' : 'eraser');
  });
  updateUndo();
  $(root, '#clear').addEventListener('click', () => {
    if (!strokes.length) return;
    if (!confirm(text.editor.clearConfirm)) return;
    pushHistory({ type: 'clear', strokes: strokes.splice(0, strokes.length) });
    render();
    markStrokesChanged(true);
  });

  const photoMenu = $(root, '#photo-menu');
  const fileInput = $<HTMLInputElement>(root, '#file');
  $(root, '#photo').addEventListener('click', () => {
    $(root, '#arrange-photos').hidden = images.length === 0;
    photoMenu.hidden = !photoMenu.hidden;
  });
  $(root, '#add-photo').addEventListener('click', () => {
    photoMenu.hidden = true;
    fileInput.value = '';
    fileInput.click();
  });
  $(root, '#arrange-photos').addEventListener('click', () => {
    photoMenu.hidden = true;
    setMode('arrange');
    if (images.length) select(images[images.length - 1]!);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void addPhoto(file);
  });
  $(root, '#arrange-done').addEventListener('click', () => setMode('write'));
  $(root, '#img-delete').addEventListener('click', () => void removeSelected());
  document.addEventListener('pointerdown', closeMenus, true);
  function closeMenus(e: Event): void {
    if (!photoMenu.hidden && !(e.target as HTMLElement).closest('#photo, #photo-menu')) photoMenu.hidden = true;
  }

  // --- saving ------------------------------------------------------------------
  // Strokes are appended (tiny payloads); undo/clear replace the list once.
  let serverStrokeCount = strokes.length;
  let needFullStrokes = false;
  let imagesDirty = false;
  let saveTimer = 0;
  let lock: Promise<unknown> = Promise.resolve();

  function withSaveLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = lock.then(fn, fn);
    lock = run.catch(() => {});
    return run;
  }

  function setStatus(text: string, kind: '' | 'busy' | 'error' = ''): void {
    status.textContent = text;
    status.dataset.kind = kind;
  }
  const isDirty = () => needFullStrokes || strokes.length !== serverStrokeCount || imagesDirty;

  function markStrokesChanged(full: boolean): void {
    if (full) needFullStrokes = true;
    setStatus(text.editor.unsaved, 'busy');
    scheduleSave();
  }
  function markImagesChanged(): void {
    imagesDirty = true;
    setStatus(text.editor.unsaved, 'busy');
    scheduleSave();
  }
  function scheduleSave(delay = AUTOSAVE_DELAY): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void save(), delay);
  }

  async function save(): Promise<void> {
    if (!isDirty()) return;
    if (activePointers > 0) {
      scheduleSave(); // never serialise while a pen is on the paper
      return;
    }
    await withSaveLock(async () => {
      setStatus(text.editor.saving, 'busy');
      try {
        if (needFullStrokes || strokes.length < serverStrokeCount) {
          const snapshot = strokes.slice();
          const r = await updateCard(card.id, editToken, { strokes: snapshot });
          needFullStrokes = false;
          serverStrokeCount = r.strokeCount;
        } else if (strokes.length > serverStrokeCount) {
          const batch = strokes.slice(serverStrokeCount);
          try {
            const r = await appendStrokes(card.id, editToken, { after: serverStrokeCount, strokes: batch });
            serverStrokeCount = r.strokeCount;
          } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
              needFullStrokes = true; // out of sync with the server; resend everything
            } else throw err;
          }
        }
        if (imagesDirty) {
          imagesDirty = false;
          await updateCard(card.id, editToken, { images: images.slice() });
        }
        setStatus(isDirty() ? text.editor.unsaved : text.common.saved, isDirty() ? 'busy' : '');
      } catch (err) {
        setStatus(err instanceof ApiError && err.status === 403 ? text.editor.editForbidden : text.editor.saveRetry, 'error');
        scheduleSave(4000);
        return;
      }
    });
    if (isDirty()) scheduleSave(200);
  }

  async function flush(): Promise<void> {
    window.clearTimeout(saveTimer);
    let attempts = 0;
    while (isDirty() && attempts++ < 3) {
      await save();
      await lock;
    }
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty()) e.preventDefault();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onBeforeUnload);

  // --- share / navigation --------------------------------------------------
  const share = $(root, '#share');
  void shapeQrSvg(shareUrl, { image: { svg: markSvg(), width: 0.45, height: 0.45 }, color: '#1f1a17', eyeColor: CIRCLE_BLUE })
    .then((svg) => {
      $(root, '#qr').innerHTML = svg;
    })
    .catch(() => {});
  $(root, '#done').addEventListener('click', async () => {
    setMode('write');
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
      copy.textContent = text.editor.copied;
      setTimeout(() => (copy.textContent = text.editor.copy), 1500);
    } catch {
      prompt(text.editor.copyPrompt, shareUrl);
    }
  });
  const native = $<HTMLButtonElement>(root, '#native-share');
  if (typeof navigator.share === 'function') {
    native.hidden = false;
    native.addEventListener('click', () => {
      void navigator
        .share({ title: card.recipient ? text.editor.shareTitle(card.recipient) : text.editor.shareTitleGeneric, url: shareUrl })
        .catch(() => {});
    });
  }
  $(root, '#preview').addEventListener('click', async () => {
    await flush();
    navigate(`/c/${card.id}`);
  });

  renderImages();

  return () => {
    document.body.classList.remove('editing');
    ro.disconnect();
    viewport.destroy();
    debug?.destroy();
    window.clearTimeout(saveTimer);
    window.clearTimeout(badgeTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', closeMenus, true);
    window.removeEventListener('beforeunload', onBeforeUnload);
    for (const url of blobUrls.values()) URL.revokeObjectURL(url);
    if (isDirty()) void save();
  };
}
