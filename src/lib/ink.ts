import type { Point, Stroke } from '../../shared/types.ts';

/**
 * Ink rendering. A stroke is a chain of drawable "units": a start cap, one
 * quadratic curve per interior sample (through midpoints, control = sample)
 * and a tail. Units can be drawn incrementally and partially, which lets the
 * editor draw live, and the viewer replay with a moving pen tip.
 */

export const INKS = [
  { id: 'ink', name: 'Ink', color: '#1f1a17' },
  { id: 'navy', name: 'Navy', color: '#22407a' },
  { id: 'red', name: 'Cherry', color: '#c9333a' },
  { id: 'green', name: 'Forest', color: '#2f6b4a' },
  { id: 'gold', name: 'Gold', color: '#b8860b' },
  { id: 'violet', name: 'Violet', color: '#6b3fa0' },
] as const;

export const BRUSHES = [
  { id: 'fine', name: 'Fine', size: 5 },
  { id: 'medium', name: 'Medium', size: 8 },
  { id: 'bold', name: 'Bold', size: 13 },
] as const;

/** Largest backing store we allow per canvas (device pixels). */
const MAX_CANVAS_PIXELS = 3_500_000;

/**
 * Sizes a canvas for its CSS box at device resolution (times `pixelScale`, for
 * content that will be zoomed) and maps `logicalW x logicalH` onto it.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  cssW: number,
  cssH: number,
  pixelScale = 1,
): CanvasRenderingContext2D {
  let scale = Math.min(window.devicePixelRatio || 1, 3) * pixelScale;
  const px = cssW * cssH * scale * scale;
  if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px);
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

function widthFor(size: number, pressure: number): number {
  return size * (0.35 + 0.95 * pressure);
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

/**
 * Draws unit `k` of a stroke, optionally only its first `frac` (0..1] so a pen
 * tip can sit part-way along it.
 */
export function drawUnit(ctx: CanvasRenderingContext2D, stroke: Stroke, k: number, offsetX: number, frac = 1): void {
  const pts = stroke.points;
  const n = pts.length;
  if (n === 0 || k < 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (n === 1) {
    const p0 = pts[0]!;
    ctx.beginPath();
    ctx.arc(p0.x + offsetX, p0.y, widthFor(stroke.size, p0.p) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  let ax: number, ay: number, cx: number, cy: number, bx: number, by: number;
  let curved = false;
  let pressure: number;
  if (k === 0) {
    const p0 = pts[0]!;
    const m = mid(p0, pts[1]!);
    ax = p0.x; ay = p0.y; bx = m.x; by = m.y; cx = ax; cy = ay;
    pressure = p0.p;
  } else if (k <= n - 2) {
    const prev = pts[k - 1]!;
    const cur = pts[k]!;
    const next = pts[k + 1]!;
    const a = mid(prev, cur);
    const b = mid(cur, next);
    ax = a.x; ay = a.y; cx = cur.x; cy = cur.y; bx = b.x; by = b.y;
    curved = true;
    pressure = cur.p;
  } else if (k === n - 1) {
    const prev = pts[n - 2]!;
    const last = pts[n - 1]!;
    const a = mid(prev, last);
    ax = a.x; ay = a.y; bx = last.x; by = last.y; cx = ax; cy = ay;
    pressure = last.p;
  } else {
    return;
  }

  if (frac < 1) {
    // de Casteljau split at `frac`: keep the first part.
    const f = Math.max(0, frac);
    const q0x = ax + (cx - ax) * f, q0y = ay + (cy - ay) * f;
    const q1x = cx + (bx - cx) * f, q1y = cy + (by - cy) * f;
    bx = q0x + (q1x - q0x) * f; by = q0y + (q1y - q0y) * f;
    cx = q0x; cy = q0y;
  }

  ctx.lineWidth = widthFor(stroke.size, pressure);
  ctx.beginPath();
  ctx.moveTo(ax + offsetX, ay);
  if (curved) ctx.quadraticCurveTo(cx + offsetX, cy, bx + offsetX, by);
  else ctx.lineTo(bx + offsetX, by);
  ctx.stroke();
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
