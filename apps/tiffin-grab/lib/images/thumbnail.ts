import { encodeCanvasToFile, fitWithin } from "./export-image";

// Downscale an image File to a small static thumbnail (WebP) drawn on a canvas.
// Runs in the browser (composer); the original is uploaded separately, secured.
export async function makeThumbnail(file: File, maxDim = 320): Promise<File> {
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
    return encodeCanvasToFile(canvas, { fileName: `${base}-thumb` });
  } finally {
    URL.revokeObjectURL(url);
  }
}
