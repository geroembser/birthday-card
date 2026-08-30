import qrcode from 'qrcode-generator';

/**
 * ShapeQRCode for the web — a port of github.com/geroembser/ShapeQRCode:
 * every dark module is a circle, an image sits in the middle at a given
 * percentage of the code, and modules keep flowing under the image wherever
 * it is transparent — only modules that touch an opaque pixel are dropped.
 * Function patterns (finders, timing, alignment) are always kept, and error
 * correction defaults to High so the result stays scannable.
 */

export interface ShapeQrImage {
  /** Inline SVG markup (must start with an <svg> tag carrying a viewBox). */
  svg: string;
  /** Size relative to the whole code, 0..1. */
  width: number;
  height: number;
}

export interface ShapeQrOptions {
  image?: ShapeQrImage;
  color?: string;
  /** Gap between modules as a fraction of the code's width (ShapeQRCode default 0.003). */
  moduleSpacingPercent?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Alpha (0..255) above which a pixel counts as opaque. */
  alphaThreshold?: number;
  /** Finder "eyes": solid circular rings scan far more reliably than dot grids. */
  finderStyle?: 'rings' | 'dots';
  /** Colour of the finder eyes (defaults to `color`). */
  eyeColor?: string;
  /** Testing aid: drop modules under the image but don't draw the image. */
  hideImage?: boolean;
}

const RASTER = 600; // px used for transparency detection

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterise the image'));
    };
    img.src = url;
  });
}

/** Modules that must never be removed: finders (+separators, format info), timing lines, alignment patterns. */
function isFunctionModule(n: number, r: number, c: number): boolean {
  if ((r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9)) return true;
  if (r === 6 || c === 6) return true;
  const version = (n - 17) / 4;
  if (version >= 2) {
    // Alignment pattern centres per the QR spec (enough for versions 2..13).
    const table: Record<number, number[]> = {
      2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46],
      10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62],
    };
    const centres = table[version] ?? [];
    for (const cy of centres) {
      for (const cx of centres) {
        const inFinder = (cy === 6 && cx === 6) || (cy === 6 && cx === centres[centres.length - 1]) || (cx === 6 && cy === centres[centres.length - 1]);
        if (inFinder) continue;
        if (Math.abs(r - cy) <= 2 && Math.abs(c - cx) <= 2) return true;
      }
    }
  }
  return false;
}

export async function shapeQrSvg(text: string, opts: ShapeQrOptions = {}): Promise<string> {
  const ecl = opts.errorCorrectionLevel ?? 'H';
  const color = opts.color ?? '#000';
  const qr = qrcode(0, ecl);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();

  const S = 1000; // SVG user units for the whole code
  const spacing = (opts.moduleSpacingPercent ?? 0.003) * S;
  const moduleLength = (S - (n - 1) * spacing) / n;
  const moduleDistance = moduleLength + spacing;

  // --- transparency detection ----------------------------------------------
  let alpha: Uint8ClampedArray | null = null;
  let imgRect: { x: number; y: number; w: number; h: number } | null = null;
  if (opts.image) {
    const w = opts.image.width * S;
    const h = opts.image.height * S;
    imgRect = { x: (S - w) / 2, y: (S - h) / 2, w, h };
    try {
      const img = await loadSvg(opts.image.svg);
      const canvas = document.createElement('canvas');
      canvas.width = RASTER;
      canvas.height = RASTER;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const k = RASTER / S;
      ctx.drawImage(img, imgRect.x * k, imgRect.y * k, imgRect.w * k, imgRect.h * k);
      alpha = ctx.getImageData(0, 0, RASTER, RASTER).data;
    } catch {
      alpha = null; // no detection possible: draw all modules and let the image sit on top
    }
  }
  const threshold = opts.alphaThreshold ?? 8;
  const opaqueInRect = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (!alpha) return false;
    const k = RASTER / S;
    const px0 = Math.max(0, Math.floor(x0 * k));
    const py0 = Math.max(0, Math.floor(y0 * k));
    const px1 = Math.min(RASTER - 1, Math.ceil(x1 * k));
    const py1 = Math.min(RASTER - 1, Math.ceil(y1 * k));
    for (let y = py0; y <= py1; y++) {
      for (let x = px0; x <= px1; x++) {
        if (alpha[(y * RASTER + x) * 4 + 3]! > threshold) return true;
      }
    }
    return false;
  };

  // --- modules ---------------------------------------------------------------
  const finderStyle = opts.finderStyle ?? 'rings';
  const inFinder = (row: number, col: number) => (row < 7 && col < 7) || (row < 7 && col >= n - 7) || (row >= n - 7 && col < 7);
  let out = '';
  const r = moduleLength / 2;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!qr.isDark(row, col)) continue;
      if (finderStyle === 'rings' && inFinder(row, col)) continue;
      const x = col * moduleDistance;
      const y = row * moduleDistance;
      if (imgRect && !isFunctionModule(n, row, col)) {
        const intersects = x < imgRect.x + imgRect.w && x + moduleLength > imgRect.x && y < imgRect.y + imgRect.h && y + moduleLength > imgRect.y;
        if (intersects && (alpha ? opaqueInRect(x, y, x + moduleLength, y + moduleLength) : true)) continue;
      }
      out += `<circle cx="${(x + r).toFixed(2)}" cy="${(y + r).toFixed(2)}" r="${r.toFixed(2)}"/>`;
    }
  }

  // --- finder eyes as rings ------------------------------------------------------
  let eyes = '';
  if (finderStyle === 'rings') {
    const eyeColor = opts.eyeColor ?? color;
    for (const [row, col] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      const cx = col * moduleDistance + 3.5 * moduleDistance - spacing / 2;
      const cy = row * moduleDistance + 3.5 * moduleDistance - spacing / 2;
      eyes += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(3 * moduleDistance).toFixed(2)}" fill="none" stroke="${eyeColor}" stroke-width="${moduleDistance.toFixed(2)}"/>`;
      eyes += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(1.5 * moduleDistance).toFixed(2)}" fill="${eyeColor}"/>`;
    }
  }

  // --- the image, inline ---------------------------------------------------------
  let imageMarkup = '';
  if (opts.image && imgRect && !opts.hideImage) {
    const inner = opts.image.svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const viewBox = opts.image.svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100';
    imageMarkup = `<svg x="${imgRect.x.toFixed(2)}" y="${imgRect.y.toFixed(2)}" width="${imgRect.w.toFixed(2)}" height="${imgRect.h.toFixed(2)}" viewBox="${viewBox}">${inner}</svg>`;
  }

  return `<svg class="shape-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="geometricPrecision"><g fill="${color}">${out}</g>${eyes}${imageMarkup}</svg>`;
}

// Exposed for the headless scannability tests.
(globalThis as unknown as { __shapeQrSvg?: typeof shapeQrSvg }).__shapeQrSvg = shapeQrSvg;
