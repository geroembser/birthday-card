import type { Point, Stroke } from '../../shared/types.ts';

/**
 * Ink rendering. A stroke is a chain of drawable "units": a start cap, one
 * quadratic curve per interior sample (through midpoints, control = sample)
 * and a tail. Each unit is made from overlapping native canvas curves so the
 * browser antialiases tight handwriting without exposing polygon edges. Units
 * can still be drawn incrementally and partially for live ink and replay.
 */

export const INKS = [
  { id: 'ink', color: '#1f1a17' },
  { id: 'navy', color: '#22407a' },
  { id: 'red', color: '#c9333a' },
  { id: 'green', color: '#2f6b4a' },
  { id: 'gold', color: '#b8860b' },
  { id: 'violet', color: '#6b3fa0' },
] as const;

export const BRUSHES = [
  { id: 'fine', size: 5 },
  { id: 'medium', size: 8 },
  { id: 'bold', size: 13 },
] as const;

/** Largest backing store we allow per canvas (device pixels). */
const MAX_CANVAS_PIXELS = 3_500_000;

/**
 * Sizes a canvas for its CSS box at device resolution (times `pixelScale`, for
 * supersampling or zoom), within `maxPixels`, and maps `logicalW x logicalH`
 * onto it.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  cssW: number,
  cssH: number,
  pixelScale = 1,
  maxPixels = MAX_CANVAS_PIXELS,
): CanvasRenderingContext2D {
  let scale = Math.min(window.devicePixelRatio || 1, 3) * pixelScale;
  const px = cssW * cssH * scale * scale;
  if (px > maxPixels) scale *= Math.sqrt(maxPixels / px);
  const w = Math.max(1, Math.round(cssW * scale));
  const h = Math.max(1, Math.round(cssH * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(w / logicalW, 0, 0, h / logicalH, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

/** Clears the whole backing store regardless of the current transform. */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/**
 * Pressure → line width. The floor is deliberately high: a light Pencil touch
 * reports pressure near 0 and must still leave a visible mark.
 */
function widthFor(size: number, pressure: number): number {
  return size * (0.5 + 0.8 * pressure);
}

/**
 * Per-point widths, smoothed causally (only past samples, so the value never
 * changes once drawn) and rate-limited so pressure noise can't ripple the edge.
 */
const widthCache = new WeakMap<Stroke, number[]>();
function smoothedWidths(stroke: Stroke): number[] {
  let w = widthCache.get(stroke);
  if (!w) {
    w = [];
    widthCache.set(stroke, w);
  }
  const pts = stroke.points;
  if (w.length > pts.length) w.length = 0;
  for (let i = w.length; i < pts.length; i++) {
    const raw = widthFor(stroke.size, pts[i]!.p);
    if (i === 0) {
      w.push(raw);
    } else {
      const prev = w[i - 1]!;
      const lim = stroke.size * 0.1;
      w.push(prev + Math.max(-lim, Math.min(lim, (raw - prev) * 0.3)));
    }
  }
  return w;
}

function mid(a: Point, b: Point): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Number of drawable units given `n` known points (and whether the stroke ended). */
export function unitCount(n: number, final: boolean): number {
  if (n <= 0) return 0;
  if (n === 1) return final ? 1 : 0;
  return n - 1 + (final ? 1 : 0);
}

const TAIL_TAPER = 0.45; // width at the very end of a stroke, relative to the last sample
const WIDTH_STEP = 0.06; // maximum width change per native curve, relative to brush size
const MAX_WIDTH_SEGMENTS = 8;

function quadAt(a: number, c: number, b: number, t: number): number {
  const u = 1 - t;
  return u * u * a + 2 * u * t * c + t * t * b;
}

function quadDerivativeAt(a: number, c: number, b: number, t: number): number {
  return 2 * ((1 - t) * (c - a) + t * (b - c));
}

/**
 * Draws unit `k` of a stroke with a continuously varying width, optionally
 * only through `frac` (0..1] so a pen tip can sit part-way along it.
 *
 * Canvas cannot vary line width within one path. Splitting only when the
 * pressure-derived width changes keeps the centreline as true quadratic
 * curves, while round, overlapping caps make the pieces read as one stroke.
 */
export function drawUnit(ctx: CanvasRenderingContext2D, stroke: Stroke, k: number, offsetX: number, frac = 1): void {
  const pts = stroke.points;
  const n = pts.length;
  if (n === 0 || k < 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = smoothedWidths(stroke);

  if (n === 1) {
    const p0 = pts[0]!;
    dot(ctx, p0.x + offsetX, p0.y, Math.max(w[0]! / 2, stroke.size * 0.45));
    return;
  }

  // Quadratic a → b with control c, and widths at a, c, b.
  let ax: number, ay: number, cx: number, cy: number, bx: number, by: number;
  let wa: number, wc: number, wb: number;
  let startCap = false;
  let endCap = false;
  if (k === 0) {
    const p0 = pts[0]!;
    const m = mid(p0, pts[1]!);
    ax = p0.x; ay = p0.y; bx = m.x; by = m.y;
    wa = w[0]!; wb = (w[0]! + w[1]!) / 2;
    cx = (ax + bx) / 2; cy = (ay + by) / 2; wc = (wa + wb) / 2;
    startCap = true;
  } else if (k <= n - 2) {
    const prev = pts[k - 1]!;
    const cur = pts[k]!;
    const next = pts[k + 1]!;
    const a = mid(prev, cur);
    const b = mid(cur, next);
    ax = a.x; ay = a.y; cx = cur.x; cy = cur.y; bx = b.x; by = b.y;
    wa = (w[k - 1]! + w[k]!) / 2; wc = w[k]!; wb = (w[k]! + w[k + 1]!) / 2;
  } else if (k === n - 1) {
    const prev = pts[n - 2]!;
    const last = pts[n - 1]!;
    const a = mid(prev, last);
    ax = a.x; ay = a.y; bx = last.x; by = last.y;
    wa = (w[n - 2]! + w[n - 1]!) / 2; wb = w[n - 1]! * TAIL_TAPER;
    cx = (ax + bx) / 2; cy = (ay + by) / 2; wc = (wa + wb) / 2;
    endCap = true;
  } else {
    return;
  }

  const f = Math.max(0, Math.min(1, frac));
  if (f === 0) return;

  const widthAt = (t: number) => quadAt(wa, wc, wb, t);
  const w0 = widthAt(0);
  const wm = widthAt(f / 2);
  const wf = widthAt(f);
  const widthTravel = Math.abs(wm - w0) + Math.abs(wf - wm);
  const segments = Math.max(1, Math.min(MAX_WIDTH_SEGMENTS, Math.ceil(widthTravel / (stroke.size * WIDTH_STEP))));

  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * f;
    const t1 = ((i + 1) / segments) * f;
    const x0 = quadAt(ax, cx, bx, t0);
    const y0 = quadAt(ay, cy, by, t0);
    const x1 = quadAt(ax, cx, bx, t1);
    const y1 = quadAt(ay, cy, by, t1);
    const dt = t1 - t0;
    const qx = x0 + (quadDerivativeAt(ax, cx, bx, t0) * dt) / 2;
    const qy = y0 + (quadDerivativeAt(ay, cy, by, t0) * dt) / 2;

    ctx.lineWidth = Math.max(0.1, widthAt((t0 + t1) / 2));
    if (Math.hypot(qx - x0, qy - y0) + Math.hypot(x1 - qx, y1 - qy) < 1e-5) {
      dot(ctx, x0 + offsetX, y0, ctx.lineWidth / 2);
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x0 + offsetX, y0);
    ctx.quadraticCurveTo(qx + offsetX, qy, x1 + offsetX, y1);
    ctx.stroke();
  }

  // Preserve the deliberate full-sized tap/start and the subtle Pencil-lift taper.
  if (startCap) dot(ctx, ax + offsetX, ay, wa / 2);
  if (endCap && f >= 1) dot(ctx, bx + offsetX, by, wb / 2);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws the units that became drawable now that `available` points are known,
 * given `drawn` units were already drawn. Returns the new `drawn`.
 */
export function drawStrokeProgress(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  drawn: number,
  available: number,
  final: boolean,
  offsetX: number,
): number {
  const total = unitCount(Math.min(available, stroke.points.length), final);
  for (let k = drawn; k < total; k++) drawUnit(ctx, stroke, k, offsetX);
  return Math.max(drawn, total);
}

/** Draws every stroke completely. */
export function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], offsetX: number): void {
  for (const s of strokes) drawStrokeProgress(ctx, s, 0, s.points.length, true, offsetX);
}
