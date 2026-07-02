export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportOptions {
  cropPixels: CropPixels;
  rotation?: number; // degrees
  flipH?: boolean;
  flipV?: boolean;
  round?: boolean;
  optimize?: boolean; // default true
  fileName?: string; // output stem
}

/** Scale (w,h) so the longest side is at most maxDim; identity if already within. */
export function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const s = maxDim / longest;
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("could not load image")));
    img.src = src;
  });
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Bake crop + rotation + flips (+ optional circle) into a canvas and encode WebP.
 * cropPixels are in react-easy-crop's rotated-image pixel space (the canonical
 * getCroppedImg contract): draw the rotated/flipped image to a bounding-box
 * canvas, then copy the crop rectangle out.
 */
export async function exportImage(src: string, opts: ExportOptions): Promise<File> {
  const {
    cropPixels,
    rotation = 0,
    flipH = false,
    flipV = false,
    round = false,
    optimize = true,
    fileName = "image",
  } = opts;

  const image = await loadImage(src);
  const rot = toRad(rotation);
  const iw = image.width;
  const ih = image.height;
  const bboxW = Math.abs(Math.cos(rot) * iw) + Math.abs(Math.sin(rot) * ih);
  const bboxH = Math.abs(Math.sin(rot) * iw) + Math.abs(Math.cos(rot) * ih);

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = Math.ceil(bboxW);
  rotCanvas.height = Math.ceil(bboxH);
  const rctx = rotCanvas.getContext("2d");
  if (!rctx) throw new Error("canvas 2d context unavailable");
  rctx.translate(bboxW / 2, bboxH / 2);
  rctx.rotate(rot);
  rctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  rctx.drawImage(image, -iw / 2, -ih / 2);

  const maxDim = optimize ? 1600 : Number.POSITIVE_INFINITY;
  const out = fitWithin(cropPixels.width, cropPixels.height, maxDim);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = out.w;
  outCanvas.height = out.h;
  const octx = outCanvas.getContext("2d");
  if (!octx) throw new Error("canvas 2d context unavailable");

  if (round) {
    octx.beginPath();
    octx.ellipse(out.w / 2, out.h / 2, out.w / 2, out.h / 2, 0, 0, Math.PI * 2);
    octx.closePath();
    octx.clip();
  }
  octx.drawImage(
    rotCanvas,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    out.w,
    out.h,
  );

  const quality = optimize ? 0.82 : 0.95;
  const webp = await encode(outCanvas, "image/webp", quality);
  if (webp) return new File([webp], `${fileName}.webp`, { type: "image/webp" });
  const jpeg = await encode(outCanvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("image export failed");
  return new File([jpeg], `${fileName}.jpg`, { type: "image/jpeg" });
}
