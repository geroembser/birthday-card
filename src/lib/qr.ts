import qrcode from 'qrcode-generator';

export interface QrOptions {
  /** `dots` draws round modules and circular finder "eyes" (my.card style). */
  style?: 'square' | 'dots';
  color?: string;
  eyeColor?: string;
}

/** Renders `text` as an inline SVG QR code (scales to its container). */
export function qrSvg(text: string, opts: QrOptions = {}): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  if (opts.style !== 'dots') return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });

  const n = qr.getModuleCount();
  const c = 4;
  const color = opts.color ?? '#1f1a17';
  const eye = opts.eyeColor ?? color;
  const inEye = (r: number, col: number) => (r < 7 && col < 7) || (r < 7 && col >= n - 7) || (r >= n - 7 && col < 7);
  let out = '';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col) && !inEye(r, col)) {
        out += `<circle cx="${(col + 0.5) * c}" cy="${(r + 0.5) * c}" r="${c * 0.42}" fill="${color}"/>`;
      }
    }
  }
  for (const [r, col] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
    const cx = (col + 3.5) * c;
    const cy = (r + 3.5) * c;
    out += `<circle cx="${cx}" cy="${cy}" r="${3 * c}" fill="none" stroke="${eye}" stroke-width="${c}"/>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${1.5 * c}" fill="${eye}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n * c} ${n * c}" shape-rendering="geometricPrecision">${out}</svg>`;
}

// Exposed for the headless scannability tests.
(globalThis as unknown as { __qrSvg?: typeof qrSvg }).__qrSvg = qrSvg;
