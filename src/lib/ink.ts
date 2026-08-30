import type { Point, Stroke } from '../../shared/types.ts';

/**
 * Ink rendering. A stroke is a chain of drawable "units": a start cap, one
 * quadratic curve per interior sample (through midpoints, control = sample)
 * and a tail. Units can be drawn incrementally and partially, which lets the
 * editor draw live, and the viewer replay with a moving pen tip.
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

/**
 * Pressure → line width. The floor is deliberately high: a light Pencil touch
 * reports pressure near 0 and must still leave a visible mark.
 */
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
const SAMPLE_STEP = 2.2; // spread units between outline samples
const OVERLAP = 0.7; // spread units each unit extends past its ends, hiding anti-aliasing seams

/**
 * Draws unit `k` of a stroke as a filled outline with continuously varying
 * width, optionally only its first `frac` (0..1] so a pen tip can sit
 * part-way along it. Units share exact boundary samples, so consecutive
 * units tile seamlessly.
 */
export function drawUnit(ctx: CanvasRenderingContext2D, stroke: Stroke, k: number, offsetX: number, frac = 1): void {
  const pts = stroke.points;
  const n = pts.length;
  if (n === 0 || k < 0) return;
  ctx.fillStyle = stroke.color;
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
  const len = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy);
  const m = Math.max(1, Math.min(12, Math.round((len * f) / SAMPLE_STEP)));
  const L: number[] = [];
  const R: number[] = [];
  let nx = 0;
  let ny = 0;
  let lastX = ax;
  let lastY = ay;
  let lastW = wa;
  // Extend a little past both ends (along the tangent) so neighbouring units overlap.
  const ext = len > 1e-6 ? Math.min(OVERLAP, len / 2) : 0;
  const extStart = startCap ? 0 : ext;
  const extEnd = endCap || f < 1 ? 0 : ext;
  for (let i = -1; i <= m + 1; i++) {
    if ((i === -1 && !extStart) || (i === m + 1 && !extEnd)) continue;
    const t = (Math.max(0, Math.min(m, i)) / m) * f;
    const u = 1 - t;
    let x = u * u * ax + 2 * u * t * cx + t * t * bx;
    let y = u * u * ay + 2 * u * t * cy + t * t * by;
    const width = u * u * wa + 2 * u * t * wc + t * t * wb;
    let dx = 2 * u * (cx - ax) + 2 * t * (bx - cx);
    let dy = 2 * u * (cy - ay) + 2 * t * (by - cy);
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = bx - ax;
      dy = by - ay;
      d = Math.hypot(dx, dy);
    }
    if (d >= 1e-6) {
      nx = -dy / d;
      ny = dx / d;
      if (i === -1) {
        x -= (dx / d) * extStart;
        y -= (dy / d) * extStart;
      } else if (i === m + 1) {
        x += (dx / d) * extEnd;
        y += (dy / d) * extEnd;
      }
    }
    const h = width / 2;
    L.push(x + nx * h + offsetX, y + ny * h);
    R.push(x - nx * h + offsetX, y - ny * h);
    if (i <= m) {
      lastX = x; lastY = y; lastW = width;
    }
  }

  ctx.beginPath();
  ctx.moveTo(L[0]!, L[1]!);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i]!, L[i + 1]!);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i]!, R[i + 1]!);
  ctx.closePath();
  ctx.fill();

  if (startCap) dot(ctx, ax + offsetX, ay, wa / 2);
  if (endCap && f >= 1) dot(ctx, bx + offsetX, by, wb / 2);
  if (f < 1) dot(ctx, lastX + offsetX, lastY, lastW / 2); // the pen tip
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
