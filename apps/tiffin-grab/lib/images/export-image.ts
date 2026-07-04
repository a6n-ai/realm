/** Scale (w,h) so the longest side is at most maxDim; identity if already within. */
export function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const s = maxDim / longest;
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** Encode a finished (already cropped/rotated) canvas to an optimized WebP File (JPEG fallback). */
export async function encodeCanvasToFile(
  canvas: HTMLCanvasElement,
  opts: { optimize?: boolean; fileName?: string } = {},
): Promise<File> {
  const quality = opts.optimize === false ? 0.95 : 0.82;
  const name = opts.fileName ?? "image";
  const webp = await encodeCanvas(canvas, "image/webp", quality);
  if (webp) return new File([webp], `${name}.webp`, { type: "image/webp" });
  const jpeg = await encodeCanvas(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("image export failed");
  return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" });
}
