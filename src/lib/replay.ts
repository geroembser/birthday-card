import type { CardData, CardImage, Stroke } from '../../shared/types.ts';
import { PAGE_W } from '../../shared/types.ts';
import { clearCanvas, drawUnit, unitCount } from './ink.ts';

/**
 * Replays a card on a compressed timeline: pen motion runs at REPLAY_SPEED×,
 * thinking pauses are capped, photos appear in the order they were added.
 * Ink is drawn in two layers per page: settled ink on `main`, and the last
 * FADE_MS of ink on `wet`, fading in behind a continuously moving pen tip.
 */
export const REPLAY_SPEED = 3.2;
export const MAX_GAP_MS = 200;
export const START_DELAY_MS = 350;
export const IMAGE_PAUSE_MS = 650;
const FADE_MS = 220;

export type Page = 'left' | 'right' | 'both';

export interface PageTargets {
  main: CanvasRenderingContext2D;
  wet: CanvasRenderingContext2D;
  /** Added to every x coordinate (0 for the left page, -PAGE_W for the right). */
  offsetX: number;
}

export interface ReplayCallbacks {
  /** The writing moved to a page (or spans both). */
  onPage?(page: Page): void;
  /** A photo should appear now. */
  onImage?(image: CardImage): void;
  onDone?(): void;
}

export interface Replay {
  /** Jump to the finished card. */
  skip(): void;
  cancel(): void;
}

const FOLD_MARGIN = 24;

export function strokePage(s: Stroke): Page {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  if (maxX < PAGE_W + FOLD_MARGIN) return 'left';
  if (minX > PAGE_W - FOLD_MARGIN) return 'right';
  return 'both';
}

export function imagePage(i: CardImage): Page {
  if (i.x + i.w < PAGE_W + FOLD_MARGIN) return 'left';
  if (i.x > PAGE_W - FOLD_MARGIN) return 'right';
  return 'both';
}

interface Timeline {
  /** Replay time of each point, per stroke. */
  strokeTimes: number[][];
  /** Replay time at which each image appears. */
  imageTimes: Map<string, number>;
  end: number;
}

export function buildTimeline(strokes: Stroke[], images: CardImage[]): Timeline {
  type Item = { kind: 'stroke'; index: number; t0: number; t1: number } | { kind: 'image'; image: CardImage; t0: number; t1: number };
  const items: Item[] = [];
  strokes.forEach((s, index) => {
    if (s.points.length) items.push({ kind: 'stroke', index, t0: s.points[0]!.t, t1: s.points[s.points.length - 1]!.t });
  });
  for (const image of images) items.push({ kind: 'image', image, t0: image.t, t1: image.t });
  items.sort((a, b) => a.t0 - b.t0);

  const strokeTimes: number[][] = strokes.map(() => []);
  const imageTimes = new Map<string, number>();
  let cursor = START_DELAY_MS;
  let prevEnd: number | null = null;
  for (const item of items) {
    const gap = prevEnd === null ? 0 : Math.max(0, item.t0 - prevEnd);
    cursor += Math.min(gap / REPLAY_SPEED, MAX_GAP_MS);
    if (item.kind === 'image') {
      imageTimes.set(item.image.id, cursor);
      cursor += IMAGE_PAUSE_MS;
    } else {
      const pts = strokes[item.index]!.points;
      const times: number[] = [];
      let last = cursor;
      for (const p of pts) {
        last = Math.max(last, cursor + (p.t - item.t0) / REPLAY_SPEED);
        times.push(last);
      }
      strokeTimes[item.index] = times;
      cursor = last;
    }
    prevEnd = Math.max(prevEnd ?? 0, item.t1);
  }
  return { strokeTimes, imageTimes, end: cursor };
}

/** Replay time at which unit `k` of a stroke with point times `times` becomes drawable. */
function unitBirth(times: number[], k: number): number {
  return times[Math.min(k + 1, times.length - 1)]!;
}

export function playCard(card: CardData, pages: PageTargets[], cb: ReplayCallbacks = {}): Replay {
  const strokes = card.strokes.filter((s) => s.points.length > 0);
  const images = card.images ?? [];
  const tl = buildTimeline(strokes, images);
  const pendingImages = [...images].sort((a, b) => tl.imageTimes.get(a.id)! - tl.imageTimes.get(b.id)!);

  let raf = 0;
  let finished = false;
  let commitStroke = 0; // first stroke with uncommitted units
  let commitUnit = 0; // units of that stroke already on `main`
  let announced = 0; // strokes whose page has been announced
  let currentPage: Page | null = null;
  const start = performance.now();

  const announce = (page: Page) => {
    if (page !== currentPage) {
      currentPage = page;
      cb.onPage?.(page);
    }
  };

  const frame = (nowAbs: number) => {
    if (finished) return;
    const now = nowAbs - start;

    // Photos
    while (pendingImages.length && tl.imageTimes.get(pendingImages[0]!.id)! <= now) {
      const img = pendingImages.shift()!;
      announce(imagePage(img));
      cb.onImage?.(img);
    }

    // Page announcements for strokes that just started
    while (announced < strokes.length && tl.strokeTimes[announced]![0]! <= now) {
      announce(strokePage(strokes[announced]!));
      announced++;
    }

    // Commit settled ink to `main`
    const settledBefore = now - FADE_MS;
    while (commitStroke < strokes.length) {
      const s = strokes[commitStroke]!;
      const times = tl.strokeTimes[commitStroke]!;
      const total = unitCount(s.points.length, true);
      while (commitUnit < total && unitBirth(times, commitUnit) <= settledBefore) {
        for (const p of pages) drawUnit(p.main, s, commitUnit, p.offsetX);
        commitUnit++;
      }
      if (commitUnit < total) break;
      commitStroke++;
      commitUnit = 0;
    }

    // Wet ink: everything born within the last FADE_MS, plus the moving tip
    for (const p of pages) clearCanvas(p.wet);
    let wetUnit = commitUnit;
    for (let si = commitStroke; si < strokes.length; si++) {
      const s = strokes[si]!;
      const times = tl.strokeTimes[si]!;
      if (times[0]! > now) break;
      const total = unitCount(s.points.length, true);
      let k = wetUnit;
      wetUnit = 0;
      for (; k < total; k++) {
        const birth = unitBirth(times, k);
        if (birth > now) break;
        const alpha = Math.min(1, (now - birth) / FADE_MS);
        for (const p of pages) {
          p.wet.globalAlpha = alpha;
          drawUnit(p.wet, s, k, p.offsetX);
        }
      }
      // Pen tip: partial next unit
      if (k < total && s.points.length >= 2) {
        const b = unitBirth(times, k);
        const a = k === 0 ? times[0]! : unitBirth(times, k - 1);
        const frac = b > a ? (now - a) / (b - a) : 1;
        if (frac > 0) {
          for (const p of pages) {
            p.wet.globalAlpha = 0.3;
            drawUnit(p.wet, s, k, p.offsetX, Math.min(1, frac));
          }
        }
      }
    }
    for (const p of pages) p.wet.globalAlpha = 1;

    if (commitStroke >= strokes.length && pendingImages.length === 0) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const p of pages) clearCanvas(p.wet);
    cb.onDone?.();
  };

  raf = requestAnimationFrame(frame);

  return {
    skip() {
      if (finished) return;
      cancelAnimationFrame(raf);
      // Draw whatever is not on `main` yet
      for (let si = commitStroke; si < strokes.length; si++) {
        const s = strokes[si]!;
        const total = unitCount(s.points.length, true);
        for (let k = si === commitStroke ? commitUnit : 0; k < total; k++) {
          for (const p of pages) drawUnit(p.main, s, k, p.offsetX);
        }
      }
      commitStroke = strokes.length;
      commitUnit = 0;
      while (pendingImages.length) cb.onImage?.(pendingImages.shift()!);
      finish();
    },
    cancel() {
      finished = true;
      cancelAnimationFrame(raf);
    },
  };
}
