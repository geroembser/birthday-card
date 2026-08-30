/** Client-side photo preparation: downscale + re-encode so uploads stay small. */

const MAX_EDGE = 1600;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Object URL for immediate display; revoke when done. */
  url: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(srcUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
    const type = hasAlpha ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86));
    if (!blob) throw new Error('Could not process that image');
    return { blob, width, height, url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}
