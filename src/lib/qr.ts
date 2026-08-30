import qrcode from 'qrcode-generator';

/** Renders `text` as an inline SVG QR code (scales to its container). */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
