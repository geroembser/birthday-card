import type { Point, Stroke } from '../../shared/types.ts';

/**
 * Ink rendering. Strokes are rendered as chains of quadratic curves through the
 * midpoints of consecutive samples, which stays smooth and can be drawn
 * incrementally: the same routine powers live drawing in the editor and the
 * timed replay in the viewer.
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

export interface InkTarget {
  ctx: CanvasRenderingContext2D;
  /** Added to every x coordinate (e.g. -PAGE_W for the right-hand page). */
  offsetX: number;
}

/** Sizes a canvas for its CSS box at device resolution and maps logical units onto it. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
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

export function clearCanvas(ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number): void {
  ctx.clearRect(-2, -2, logicalW + 4, logicalH + 4);
}

function widthFor(size: number, pressure: number): number {
  return size * (0.35 + 0.95 * pressure);
}

function mid(a: Point, b: Point): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Draws the part of `stroke` that becomes drawable when `available` points are
 * known, given `drawn` points were already consumed. Returns the new `drawn`.
 * When `final` is true the trailing half-segment (and single-point dots) are
 * drawn too.
 */
export function drawStrokeProgress(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  drawn: number,
  available: number,
  final: boolean,
  offsetX: number,
): number {
  const pts = stroke.points;
  const n = Math.min(available, pts.length);
  if (n === 0) return 0;
  let d = drawn;

  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (d === 0) {
    const p0 = pts[0]!;
    if (n >= 2) {
      const m = mid(p0, pts[1]!);
      ctx.lineWidth = widthFor(stroke.size, p0.p);
      ctx.beginPath();
      ctx.moveTo(p0.x + offsetX, p0.y);
      ctx.lineTo(m.x + offsetX, m.y);
      ctx.stroke();
      d = 1;
    } else if (final) {
      ctx.beginPath();
      ctx.arc(p0.x + offsetX, p0.y, widthFor(stroke.size, p0.p) / 2, 0, Math.PI * 2);
      ctx.fill();
      return 1;
    } else {
      return 0;
    }
  }

  // Segment k (1 <= k <= n-2): mid(k-1,k) -> mid(k,k+1), control = k.
  while (d + 1 <= n - 1) {
    const prev = pts[d - 1]!;
    const cur = pts[d]!;
    const next = pts[d + 1]!;
    const a = mid(prev, cur);
    const b = mid(cur, next);
    ctx.lineWidth = widthFor(stroke.size, cur.p);
    ctx.beginPath();
    ctx.moveTo(a.x + offsetX, a.y);
    ctx.quadraticCurveTo(cur.x + offsetX, cur.y, b.x + offsetX, b.y);
    ctx.stroke();
    d++;
  }

  if (final && n >= 2 && d === n - 1) {
    const prev = pts[n - 2]!;
    const last = pts[n - 1]!;
    const a = mid(prev, last);
    ctx.lineWidth = widthFor(stroke.size, last.p);
    ctx.beginPath();
    ctx.moveTo(a.x + offsetX, a.y);
    ctx.lineTo(last.x + offsetX, last.y);
    ctx.stroke();
    d = n;
  }
  return d;
}

/** Draws every stroke completely. */
export function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], offsetX: number): void {
  for (const s of strokes) drawStrokeProgress(ctx, s, 0, s.points.length, true, offsetX);
}
