/**
 * Preview-style zoom & pan for a container. Content coordinates map to
 * container pixels via `client = k * content + t`. Handles trackpad pinch
 * (Safari gesture events / ctrl+wheel), two-finger scroll, mouse wheel,
 * touch pinch & pan (fed by the owner through pointerDown/Move/Up so it can
 * decide which pointers draw and which navigate), double-tap and animation.
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
  /** Toggle double-tap / double-click zoom at runtime. */
  zoomOnDoubleTap: boolean;
  setView(v: View, animateMs?: number): void;
  reset(animateMs?: number): void;
  /** Re-read the container size (after a resize) and jump to the fit view. */
  refit(): void;
  clientToContent(clientX: number, clientY: number): { x: number; y: number };
  contentToClient(x: number, y: number): { x: number; y: number };
  pointerDown(e: PointerEvent): boolean;
  pointerMove(e: PointerEvent): boolean;
  pointerUp(e: PointerEvent): boolean;
  destroy(): void;
}

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

export function createViewport(o: ViewportOptions): Viewport {
  const el = o.el;
  const minZoom = o.minZoom ?? 1;
  const maxZoom = o.maxZoom ?? 6;
  const hasTouch = navigator.maxTouchPoints > 0;
  let view: View = o.fit();
  let zoomOnDoubleTap = o.doubleTapZoom ?? false;
  let zoomOnDoubleClick = o.doubleClickZoom ?? false;
  let anim = 0;
  let settleTimer = 0;

  const pointers = new Map<number, { x: number; y: number; type: string }>();
  let pinch: { dist: number; mid: { x: number; y: number }; view: View } | null = null;
  let drag: { x: number; y: number; view: View } | null = null;
  let gestureBase: View | null = null; // Safari trackpad pinch
  let tap: { x: number; y: number; t: number; moved: boolean } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;

  const local = (e: { clientX: number; clientY: number }) => {
    const b = el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  function clampK(k: number): number {
    const fit = o.fit();
    return Math.min(fit.k * maxZoom, Math.max(fit.k * minZoom, k));
  }

  function clamp(v: View): View {
    const k = clampK(v.k);
    const r = o.content();
    const axis = (t: number, c: number, x0: number, len: number) => {
      const ext = k * len;
      if (ext <= c + 0.5) return (c - ext) / 2 - k * x0;
      return Math.min(-k * x0, Math.max(c - k * (x0 + len), t));
    };
    return { k, tx: axis(v.tx, el.clientWidth, r.x, r.w), ty: axis(v.ty, el.clientHeight, r.y, r.h) };
  }

  function zoomAt(k2: number, px: number, py: number, base: View): View {
    k2 = clampK(k2); // clamp first so the anchor point stays put at the limits
    const r = k2 / base.k;
    return { k: k2, tx: px - (px - base.tx) * r, ty: py - (py - base.ty) * r };
  }

  function apply(v: View, interacting: boolean): void {
    view = clamp(v);
    o.onChange(view, interacting);
  }

  /** After wheel/trackpad input stops, tell the owner the view is at rest. */
  function settle(): void {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => o.onChange(view, false), 140);
  }

  function cancelAnim(): void {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  }

  function animateTo(target: View, ms: number): void {
    cancelAnim();
    const from = view;
    const to = clamp(target);
    if (ms <= 0) {
      apply(to, false);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = easeOut(u);
      view = {
        k: from.k * Math.pow(to.k / from.k, e),
        tx: from.tx + (to.tx - from.tx) * e,
        ty: from.ty + (to.ty - from.ty) * e,
      };
      o.onChange(view, u < 1);
      anim = u < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }

  function toggleZoom(px: number, py: number): void {
    const fit = o.fit();
    if (view.k > fit.k * 1.05) animateTo(fit, 350);
    else animateTo(zoomAt(fit.k * 2.5, px, py, view), 350);
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
      apply(zoomAt(view.k * f, p.x, p.y, view), true);
    } else {
      apply({ k: view.k, tx: view.tx - e.deltaX * m, ty: view.ty - e.deltaY * m }, true);
    }
    o.onUserGesture?.();
    settle();
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
    apply(zoomAt(gestureBase.k * g.scale, p.x, p.y, gestureBase), true);
    o.onUserGesture?.();
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    if (!gestureBase) return;
    gestureBase = null;
    settle();
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
  }

  function pointerDown(e: PointerEvent): boolean {
    const isTouch = e.pointerType === 'touch';
    if (!isTouch && !(o.mousePan && e.pointerType === 'mouse' && e.button === 0)) return false;
    cancelAnim();
    const p = local(e);
    pointers.set(e.pointerId, { ...p, type: e.pointerType });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size === 1) {
      drag = { x: p.x, y: p.y, view };
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
      apply({ k: z.k, tx: z.tx + (mid.x - pinch.mid.x), ty: z.ty + (mid.y - pinch.mid.y) }, true);
      o.onUserGesture?.();
    } else if (drag) {
      const nv = { k: drag.view.k, tx: drag.view.tx + (p.x - drag.x), ty: drag.view.ty + (p.y - drag.y) };
      const before = view;
      apply(nv, true);
      if (before.tx !== view.tx || before.ty !== view.ty) o.onUserGesture?.();
    }
    return true;
  }

  function pointerUp(e: PointerEvent): boolean {
    if (!pointers.has(e.pointerId)) return false;
    pointers.delete(e.pointerId);
    const p = local(e);
    if (pointers.size === 1) {
      pinch = null;
      const [rest] = pointers.values();
      drag = { x: rest!.x, y: rest!.y, view };
    } else if (pointers.size === 0) {
      pinch = null;
      drag = null;
      if (tap && !tap.moved && e.type === 'pointerup' && performance.now() - tap.t < 300) {
        const now = performance.now();
        if (zoomOnDoubleTap && lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          lastTap = null;
          toggleZoom(p.x, p.y);
        } else {
          lastTap = { x: p.x, y: p.y, t: now };
        }
      }
      tap = null;
      if (!anim) o.onChange(view, false);
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
      apply(o.fit(), false);
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
