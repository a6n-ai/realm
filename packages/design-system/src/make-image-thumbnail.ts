/** Scale (w,h) so the longest side is at most maxDim. */
function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const s = maxDim / longest;
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Browser-side image thumbnail for MessageComposer attachments (WebP, JPEG fallback).
 * Kept in design-system so composers stay prop-light across apps.
 */
export async function makeImageThumbnail(file: File, maxDim = 320): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("thumbnail: image load failed"));
      i.src = url;
    });
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const base = file.name.replace(/\.[^.]+$/, "") || "thumb";
    const webp = await canvasToBlob(canvas, "image/webp", 0.82);
    if (webp) return new File([webp], `${base}-thumb.webp`, { type: "image/webp" });
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.82);
    if (!jpeg) throw new Error("thumbnail export failed");
    return new File([jpeg], `${base}-thumb.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
