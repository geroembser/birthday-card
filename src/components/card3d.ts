import type { CardImage, ThemeId } from '../../shared/types.ts';
import { PAGE_H, PAGE_W } from '../../shared/types.ts';
import { $, el } from '../lib/dom.ts';
import { prepareCanvas } from '../lib/ink.ts';
import type { PageTargets } from '../lib/replay.ts';
import { renderCover } from './cover.ts';

export interface Card3D {
  /** The scene (perspective container, gesture surface). */
  el: HTMLElement;
  /** Wrapper that zoom/pan transforms are applied to. */
  zoomer: HTMLElement;
  /** (Re)sizes the ink canvases to the current page size; clears them. */
  layout(): PageTargets[];
  pageSize(): { w: number; h: number };
  setImages(images: CardImage[], urlFor: (image: CardImage) => string): void;
  showImage(id: string): void;
  showAllImages(): void;
  hideAllImages(): void;
  /** Plays the opening animation. Resolves when the cover has settled. */
  open(): Promise<void>;
  readonly isOpen: boolean;
}

const PIXEL_SCALE = 2; // extra canvas resolution so zooming in stays crisp

export function createCard3D(theme: ThemeId, recipient: string): Card3D {
  const scene = el('div', 'scene');
  const page = (cls: string) => `
    <div class="page ${cls}">
      <div class="page-content"><div class="page-images"></div></div>
      <canvas class="ink main"></canvas>
      <canvas class="ink wet"></canvas>
    </div>`;
  scene.innerHTML = `
    <div class="zoomer">
      <div class="card-float floating">
        <div class="card3d">
          ${page('page-right')}
          <div class="cover">
            <div class="face face-front"></div>
            <div class="face face-inside">${page('page-left')}</div>
          </div>
        </div>
      </div>
    </div>`;

  const zoomer = $(scene, '.zoomer');
  const float = $(scene, '.card-float');
  const card = $(scene, '.card3d');
  const cover = $(scene, '.cover');
  $(scene, '.face-front').append(renderCover(theme, recipient));
  const rightPage = $(scene, '.page-right');
  const pages = [
    { root: $(scene, '.page-left'), offsetX: 0 },
    { root: rightPage, offsetX: -PAGE_W },
  ];

  let isOpen = false;

  function pageSize() {
    return { w: rightPage.offsetWidth, h: rightPage.offsetHeight };
  }

  function layout(): PageTargets[] {
    const { w, h } = pageSize();
    return pages.map((p) => {
      $(p.root, '.page-content').style.transform = `scale(${w / PAGE_W})`;
      return {
        main: prepareCanvas($(p.root, 'canvas.main'), PAGE_W, PAGE_H, w, h, PIXEL_SCALE),
        wet: prepareCanvas($(p.root, 'canvas.wet'), PAGE_W, PAGE_H, w, h, PIXEL_SCALE),
        offsetX: p.offsetX,
      };
    });
  }

  function setImages(images: CardImage[], urlFor: (image: CardImage) => string): void {
    for (const p of pages) {
      const box = $(p.root, '.page-images');
      box.replaceChildren();
      for (const img of images) {
        const node = document.createElement('img');
        node.className = 'card-photo';
        node.dataset.id = img.id;
        node.alt = '';
        node.decoding = 'async';
        node.src = urlFor(img);
        node.style.left = `${img.x + p.offsetX}px`;
        node.style.top = `${img.y}px`;
        node.style.width = `${img.w}px`;
        node.style.height = `${img.h}px`;
        box.append(node);
      }
    }
  }

  const photos = () => scene.querySelectorAll<HTMLElement>('.card-photo');

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
    zoomer,
    layout,
    pageSize,
    setImages,
    showImage(id) {
      photos().forEach((n) => {
        if (n.dataset.id === id) n.classList.add('shown');
      });
    },
    showAllImages() {
      photos().forEach((n) => n.classList.add('shown'));
    },
    hideAllImages() {
      photos().forEach((n) => n.classList.remove('shown'));
    },
    open,
    get isOpen() {
      return isOpen;
    },
  };
}
