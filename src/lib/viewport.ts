/**
 * iOS-style zoom & pan for a container. Content coordinates map to container
 * pixels via `client = k * content + t`.
 *
 * Feel: limits are soft while a gesture is in progress (rubber-banding with
 * increasing resistance beyond the zoom range or the content edges), the view
 * springs back to the nearest valid position on release, and a pan carries
 * momentum that decelerates like UIScrollView.
 *
 * Input: trackpad pinch (Safari gesture events / ctrl+wheel), two-finger
 * scroll, mouse wheel, touch pinch & pan (fed by the owner through
 * pointerDown/Move/Up so it can decide which pointers draw and which
 * navigate), double-tap / double-click, and animated programmatic moves.
 */

export interface View {
  k: number;
  tx: number;
  ty: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewportOptions {
  el: HTMLElement;
  /** Content bounds in content units (used for clamping). */
  content: () => Rect;
  /** The "fit" view for the current container size. */
  fit: () => View;
  /** Zoom range relative to the fit view. */
  minZoom?: number;
  maxZoom?: number;
  /** Let a single mouse drag pan (viewer); off where the mouse draws (editor). */
  mousePan?: boolean;
  /** Double-tap with a finger toggles zoom. */
  doubleTapZoom?: boolean;
  /** Double-click with a mouse toggles zoom (off where the mouse draws). */
  doubleClickZoom?: boolean;
  onChange: (view: View, interacting: boolean) => void;
  /** Any manual zoom/pan by the user. */
  onUserGesture?: () => void;
}

export interface Viewport {
  readonly view: View;
  readonly fitView: View;
  /** True while fingers/gesture are actively manipulating the view. */
  readonly gesturing: boolean;
  /** True while two or more fingers are pinching. */
  readonly pinching: boolean;
  /** Toggle double-tap / double-click zoom at runtime. */
  zoomOnDoubleTap: boolean;
  setView(v: View, animateMs?: number): void;
  reset(animateMs?: number): void;
  /** Re-read the container size (after a resize) and jump to the fit view. */
  refit(): void;
  /** Drop all tracked pointers (e.g. a resting palm once the pen lands). */
  cancelPointers(): void;
  clientToContent(clientX: number, clientY: number): { x: number; y: number };
  contentToClient(x: number, y: number): { x: number; y: number };
  pointerDown(e: PointerEvent): boolean;
  pointerMove(e: PointerEvent): boolean;
  pointerUp(e: PointerEvent): boolean;
  destroy(): void;
}

// --- feel constants ------------------------------------------------------------
const RUBBER = 0.55; // UIScrollView's rubber-band coefficient
const ZOOM_RESISTANCE = 0.4; // exponent applied beyond the zoom range
const DECELERATION = 0.998; // per ms, UIScrollView "normal"
const SNAP_MS = 420;
const MIN_VELOCITY = 0.02; // px/ms — below this momentum stops
const FLICK_MAX_AGE = 110; // ms of history used to estimate release velocity

const easeOutQuart = (u: number) => 1 - Math.pow(1 - u, 4);
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);

/** Distance `x` pushed past an edge of a viewport of size `d` shows as this much. */
function rubber(x: number, d: number): number {
  return (1 - 1 / ((x * RUBBER) / d + 1)) * d;
}

export function createViewport(o: ViewportOptions): Viewport {
  const el = o.el;
  const minZoom = o.minZoom ?? 1;
  const maxZoom = o.maxZoom ?? 6;
  const hasTouch = navigator.maxTouchPoints > 0;
  let zoomOnDoubleTap = o.doubleTapZoom ?? false;
  let zoomOnDoubleClick = o.doubleClickZoom ?? false;

  let view: View = o.fit();
  let anim = 0;
  let settleTimer = 0;

  const pointers = new Map<number, { x: number; y: number; type: string }>();
  let pinch: { dist: number; mid: { x: number; y: number }; view: View } | null = null;
  let drag: { x: number; y: number; view: View } | null = null;
  let gestureBase: View | null = null; // Safari trackpad pinch
  let tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;
  const history: { t: number; x: number; y: number }[] = []; // recent drag positions for flicks

  const local = (e: { clientX: number; clientY: number }) => {
    const b = el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  // --- limits ------------------------------------------------------------------
  function kRange(): [number, number] {
    const fit = o.fit();
    return [fit.k * minZoom, fit.k * maxZoom];
  }

  /** Allowed translation range per axis for scale `k` (min === max when the content fits). */
  function bounds(k: number): { x: [number, number]; y: [number, number] } {
    const r = o.content();
    const axis = (c: number, x0: number, len: number): [number, number] => {
      const ext = k * len;
      if (ext <= c + 0.5) {
        const centered = (c - ext) / 2 - k * x0;
        return [centered, centered];
      }
      return [c - k * (x0 + len), -k * x0];
    };
    return { x: axis(el.clientWidth, r.x, r.w), y: axis(el.clientHeight, r.y, r.h) };
  }

  function hardClamp(v: View): View {
    const [kMin, kMax] = kRange();
    const k = Math.min(kMax, Math.max(kMin, v.k));
    const b = bounds(k);
    return {
      k,
      tx: Math.min(b.x[1], Math.max(b.x[0], v.tx)),
      ty: Math.min(b.y[1], Math.max(b.y[0], v.ty)),
    };
  }

  /** Rubber-banded version of `v`: limits resist instead of stopping. */
  function softClamp(v: View): View {
    const [kMin, kMax] = kRange();
    let k = v.k;
    if (k > kMax) k = kMax * Math.pow(k / kMax, ZOOM_RESISTANCE);
    else if (k < kMin) k = kMin * Math.pow(k / kMin, ZOOM_RESISTANCE);
    const b = bounds(k);
    const soft = (t: number, [lo, hi]: [number, number], size: number) =>
      t > hi ? hi + rubber(t - hi, size) : t < lo ? lo - rubber(lo - t, size) : t;
    return { k, tx: soft(v.tx, b.x, el.clientWidth), ty: soft(v.ty, b.y, el.clientHeight) };
  }

  function isSettled(v: View): boolean {
    const c = hardClamp(v);
    return Math.abs(c.k - v.k) < 1e-4 && Math.abs(c.tx - v.tx) < 0.5 && Math.abs(c.ty - v.ty) < 0.5;
  }

  /** Zoom about container point (px, py), keeping the content under it fixed. Pure math, no limits. */
  function zoomAt(k2: number, px: number, py: number, base: View): View {
    const r = k2 / base.k;
    return { k: k2, tx: px - (px - base.tx) * r, ty: py - (py - base.ty) * r };
  }

  function emit(interacting: boolean): void {
    o.onChange(view, interacting);
  }

  // --- animation -----------------------------------------------------------------
  function cancelAnim(): void {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  }

  function animateTo(target: View, ms: number, ease = easeOutCubic): void {
    cancelAnim();
    const from = view;
    const to = hardClamp(target);
    if (ms <= 0) {
      view = to;
      emit(false);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = ease(u);
      view = {
        k: from.k * Math.pow(to.k / from.k, e),
        tx: from.tx + (to.tx - from.tx) * e,
        ty: from.ty + (to.ty - from.ty) * e,
      };
      emit(u < 1);
      anim = u < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }

  /** Spring back to the nearest valid view. */
  function snapBack(): void {
    animateTo(view, SNAP_MS, easeOutQuart);
  }

  /** Coast after a flick, rubber-banding at the edges, then settle. */
  function momentum(vx: number, vy: number): void {
    cancelAnim();
    let last = performance.now();
    const raw = { tx: view.tx, ty: view.ty };
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const decay = Math.pow(DECELERATION, dt);
      vx *= decay;
      vy *= decay;
      raw.tx += vx * dt;
      raw.ty += vy * dt;
      const b = bounds(view.k);
      // Past an edge, velocity dies quickly so the overshoot stays small.
      if (raw.tx > b.x[1] || raw.tx < b.x[0]) vx *= Math.pow(0.85, dt / 16);
      if (raw.ty > b.y[1] || raw.ty < b.y[0]) vy *= Math.pow(0.85, dt / 16);
      view = softClamp({ k: view.k, tx: raw.tx, ty: raw.ty });
      if (Math.abs(vx) < MIN_VELOCITY && Math.abs(vy) < MIN_VELOCITY) {
        anim = 0;
        if (isSettled(view)) emit(false);
        else snapBack();
        return;
      }
      emit(true);
      anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  /** A gesture ended: coast, spring back, or come to rest. */
  function release(vx = 0, vy = 0): void {
    window.clearTimeout(settleTimer);
    if (!isSettled(view)) {
      snapBack();
    } else if (Math.hypot(vx, vy) > MIN_VELOCITY) {
      momentum(vx, vy);
    } else if (!anim) {
      emit(false);
    }
  }

  function toggleZoom(px: number, py: number): void {
    const fit = o.fit();
    if (view.k > fit.k * 1.05) animateTo(fit, 380, easeOutQuart);
    else animateTo(zoomAt(fit.k * 2.5, px, py, view), 380, easeOutQuart);
    o.onUserGesture?.();
  }

  // --- wheel / trackpad ------------------------------------------------------
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cancelAnim();
    const p = local(e);
    const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) {
      if (gestureBase) return; // Safari also sends gesture events for the same pinch
      const f = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * m * 0.01)));
      view = softClamp(zoomAt(view.k * f, p.x, p.y, view));
    } else {
      view = softClamp({ k: view.k, tx: view.tx - e.deltaX * m, ty: view.ty - e.deltaY * m });
    }
    emit(true);
    o.onUserGesture?.();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => release(), 120);
  };
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    if (hasTouch) return; // touch pinches are handled through pointer events
    cancelAnim();
    gestureBase = view;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    if (!gestureBase) return;
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const p = local(g);
    view = softClamp(zoomAt(gestureBase.k * g.scale, p.x, p.y, gestureBase));
    emit(true);
    o.onUserGesture?.();
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    if (!gestureBase) return;
    gestureBase = null;
    release();
  };
  const onDblClick = (e: MouseEvent) => {
    if (!zoomOnDoubleClick) return;
    const p = local(e);
    toggleZoom(p.x, p.y);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('gesturestart', onGestureStart, { passive: false });
  el.addEventListener('gesturechange', onGestureChange, { passive: false });
  el.addEventListener('gestureend', onGestureEnd, { passive: false });
  el.addEventListener('dblclick', onDblClick);

  // --- pointers (touch pinch/pan, optional mouse pan) --------------------------
  function firstTwo(): [{ x: number; y: number }, { x: number; y: number }] {
    const it = pointers.values();
    return [it.next().value!, it.next().value!];
  }
  function startPinch(): void {
    const [a, b] = firstTwo();
    pinch = { dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
    drag = null;
    history.length = 0;
  }
  function startDrag(p: { x: number; y: number }): void {
    drag = { x: p.x, y: p.y, view };
    history.length = 0;
    history.push({ t: performance.now(), x: p.x, y: p.y });
  }
  function releaseVelocity(): { vx: number; vy: number } {
    const now = performance.now();
    const recent = history.filter((h) => now - h.t <= FLICK_MAX_AGE);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || last.t - first.t < 8) return { vx: 0, vy: 0 };
    const dt = last.t - first.t;
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  function pointerDown(e: PointerEvent): boolean {
    const isTouch = e.pointerType === 'touch';
    if (!isTouch && !(o.mousePan && e.pointerType === 'mouse' && e.button === 0)) return false;
    cancelAnim();
    window.clearTimeout(settleTimer);
    const p = local(e);
    pointers.set(e.pointerId, { ...p, type: e.pointerType });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size === 1) {
      startDrag(p);
      tap = isTouch ? { x: p.x, y: p.y, t: performance.now(), moved: false } : null;
    } else if (pointers.size === 2) {
      startPinch();
      tap = null;
    }
    return true;
  }

  function pointerMove(e: PointerEvent): boolean {
    const rec = pointers.get(e.pointerId);
    if (!rec) return false;
    const p = local(e);
    rec.x = p.x;
    rec.y = p.y;
    if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 10) tap.moved = true;
    if (pinch && pointers.size >= 2) {
      const [a, b] = firstTwo();
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = zoomAt(pinch.view.k * (dist / pinch.dist), pinch.mid.x, pinch.mid.y, pinch.view);
      view = softClamp({ k: z.k, tx: z.tx + (mid.x - pinch.mid.x), ty: z.ty + (mid.y - pinch.mid.y) });
      emit(true);
      o.onUserGesture?.();
    } else if (drag) {
      const now = performance.now();
      history.push({ t: now, x: p.x, y: p.y });
      while (history.length > 12) history.shift();
      const before = view;
      view = softClamp({ k: drag.view.k, tx: drag.view.tx + (p.x - drag.x), ty: drag.view.ty + (p.y - drag.y) });
      emit(true);
      if (before.tx !== view.tx || before.ty !== view.ty) o.onUserGesture?.();
    }
    return true;
  }

  function pointerUp(e: PointerEvent): boolean {
    if (!pointers.has(e.pointerId)) return false;
    pointers.delete(e.pointerId);
    const p = local(e);
    if (pointers.size === 1) {
      // Pinch → one finger left: continue as a drag from where it is.
      pinch = null;
      const [rest] = pointers.values();
      startDrag(rest!);
    } else if (pointers.size === 0) {
      const wasPinch = pinch !== null;
      const { vx, vy } = wasPinch ? { vx: 0, vy: 0 } : releaseVelocity();
      pinch = null;
      drag = null;
      let handledTap = false;
      if (tap && !tap.moved && e.type === 'pointerup' && performance.now() - tap.t < 300) {
        const now = performance.now();
        if (zoomOnDoubleTap && lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          lastTap = null;
          toggleZoom(p.x, p.y);
          handledTap = true;
        } else {
          lastTap = { x: p.x, y: p.y, t: now };
        }
      }
      tap = null;
      if (!handledTap) release(vx, vy);
    } else {
      startPinch();
    }
    return true;
  }

  return {
    get view() {
      return view;
    },
    get fitView() {
      return o.fit();
    },
    get gesturing() {
      return pointers.size > 0 || gestureBase !== null;
    },
    get pinching() {
      return pointers.size >= 2;
    },
    get zoomOnDoubleTap() {
      return zoomOnDoubleTap;
    },
    set zoomOnDoubleTap(v: boolean) {
      zoomOnDoubleTap = v;
      zoomOnDoubleClick = v && (o.doubleClickZoom ?? false);
    },
    setView(v, animateMs = 0) {
      animateTo(v, animateMs);
    },
    reset(animateMs = 0) {
      animateTo(o.fit(), animateMs);
    },
    refit() {
      cancelAnim();
      view = o.fit();
      emit(false);
    },
    cancelPointers() {
      for (const id of pointers.keys()) {
        try {
          el.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
      }
      pointers.clear();
      pinch = null;
      drag = null;
      tap = null;
      history.length = 0;
    },
    clientToContent(clientX, clientY) {
      const p = local({ clientX, clientY });
      return { x: (p.x - view.tx) / view.k, y: (p.y - view.ty) / view.k };
    },
    contentToClient(x, y) {
      return { x: view.k * x + view.tx, y: view.k * y + view.ty };
    },
    pointerDown,
    pointerMove,
    pointerUp,
    destroy() {
      cancelAnim();
      window.clearTimeout(settleTimer);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
      el.removeEventListener('dblclick', onDblClick);
    },
  };
}
