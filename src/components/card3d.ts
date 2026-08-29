import type { ThemeId } from '../../shared/types.ts';
import { PAGE_H, PAGE_W } from '../../shared/types.ts';
import { $, el } from '../lib/dom.ts';
import { prepareCanvas, type InkTarget } from '../lib/ink.ts';
import { renderCover } from './cover.ts';

export interface Card3D {
  el: HTMLElement;
  /** (Re)sizes the ink canvases to the current page size; clears them. */
  layout(): InkTarget[];
  /** Plays the opening animation. Resolves when the cover has settled. */
  open(): Promise<void>;
  readonly isOpen: boolean;
}

export function createCard3D(theme: ThemeId, recipient: string): Card3D {
  const scene = el('div', 'scene');
  scene.innerHTML = `
    <div class="card-float floating">
      <div class="card3d">
        <div class="page page-right"><canvas class="ink"></canvas></div>
        <div class="cover">
          <div class="face face-front"></div>
          <div class="face face-inside page page-left"><canvas class="ink"></canvas></div>
        </div>
      </div>
    </div>`;

  const float = $(scene, '.card-float');
  const card = $(scene, '.card3d');
  const cover = $(scene, '.cover');
  $(scene, '.face-front').append(renderCover(theme, recipient));
  const left = $<HTMLCanvasElement>(scene, '.page-left canvas');
  const right = $<HTMLCanvasElement>(scene, '.page-right canvas');
  const rightPage = $(scene, '.page-right');

  let isOpen = false;

  function layout(): InkTarget[] {
    const w = rightPage.offsetWidth;
    const h = rightPage.offsetHeight;
    return [
      { ctx: prepareCanvas(left, PAGE_W, PAGE_H, w, h), offsetX: 0 },
      { ctx: prepareCanvas(right, PAGE_W, PAGE_H, w, h), offsetX: -PAGE_W },
    ];
  }

  function open(): Promise<void> {
    if (isOpen) return Promise.resolve();
    isOpen = true;

    // Freeze the idle float where it is, then ease it back to rest.
    const current = getComputedStyle(float).transform;
    float.style.transform = current === 'none' ? '' : current;
    float.classList.remove('floating');
    requestAnimationFrame(() => requestAnimationFrame(() => (float.style.transform = 'none')));

    card.classList.add('open');

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        cover.removeEventListener('transitionend', onEnd);
        resolve();
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === cover && e.propertyName === 'transform') finish();
      };
      cover.addEventListener('transitionend', onEnd);
      setTimeout(finish, 2400); // safety net if transitionend never fires
    });
  }

  return {
    el: scene,
    layout,
    open,
    get isOpen() {
      return isOpen;
    },
  };
}
