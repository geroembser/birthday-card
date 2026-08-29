import type { Stroke } from '../../shared/types.ts';
import { drawStrokeProgress, type InkTarget } from './ink.ts';

/**
 * Replays recorded strokes on a compressed timeline: pen motion is sped up by
 * REPLAY_SPEED and thinking pauses between strokes are capped, so the message
 * unfolds at roughly the pace a person reads handwriting.
 */
export const REPLAY_SPEED = 3.2;
export const MAX_GAP_MS = 200;
export const START_DELAY_MS = 350;

/** Per-stroke, per-point replay times in ms from replay start. */
export function buildTimeline(strokes: Stroke[]): number[][] {
  const timeline: number[][] = [];
  let cursor = START_DELAY_MS;
  let prevEnd: number | null = null;
  for (const s of strokes) {
    const pts = s.points;
    if (pts.length === 0) {
      timeline.push([]);
      continue;
    }
    const t0 = pts[0]!.t;
    const gap = prevEnd === null ? 0 : Math.max(0, t0 - prevEnd);
    cursor += Math.min(gap / REPLAY_SPEED, MAX_GAP_MS);
    const times: number[] = [];
    let last = cursor;
    for (const p of pts) {
      last = Math.max(last, cursor + (p.t - t0) / REPLAY_SPEED);
      times.push(last);
    }
    timeline.push(times);
    cursor = last;
    prevEnd = pts[pts.length - 1]!.t;
  }
  return timeline;
}

export function replayDuration(strokes: Stroke[]): number {
  const tl = buildTimeline(strokes);
  for (let i = tl.length - 1; i >= 0; i--) {
    const t = tl[i]!;
    if (t.length) return t[t.length - 1]!;
  }
  return 0;
}

export interface Replay {
  cancel(): void;
  done: Promise<void>;
}

export function playStrokes(strokes: Stroke[], targets: InkTarget[]): Replay {
  const timeline = buildTimeline(strokes);
  let raf = 0;
  let cancelled = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  let si = 0;
  let drawn = 0;
  let visible = 0;
  const start = performance.now();

  const frame = (now: number) => {
    if (cancelled) return;
    const elapsed = now - start;
    while (si < strokes.length) {
      const stroke = strokes[si]!;
      const times = timeline[si]!;
      while (visible < times.length && times[visible]! <= elapsed) visible++;
      const final = visible === times.length;
      let next = drawn;
      for (const t of targets) next = drawStrokeProgress(t.ctx, stroke, drawn, visible, final, t.offsetX);
      drawn = next;
      if (final) {
        si++;
        drawn = 0;
        visible = 0;
      } else {
        break;
      }
    }
    if (si >= strokes.length) {
      resolveDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
    done,
  };
}
