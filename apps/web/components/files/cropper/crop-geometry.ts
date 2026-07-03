export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Point = { x: number; y: number };
export type View = { zoom: number; panX: number; panY: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function orientedSize(srcW: number, srcH: number, rot: number): Size {
  return rot === 90 || rot === 270 ? { w: srcH, h: srcW } : { w: srcW, h: srcH };
}

export function fitBox(boundsW: number, boundsH: number, aspect: number | null): Rect {
  if (aspect == null) return { x: 0, y: 0, w: boundsW, h: boundsH };
  let w = boundsW;
  let h = w / aspect;
  if (h > boundsH) {
    h = boundsH;
    w = h * aspect;
  }
  return { x: (boundsW - w) / 2, y: (boundsH - h) / 2, w, h };
}

export function clampBox(box: Rect, bounds: Size): Rect {
  const w = Math.min(box.w, bounds.w);
  const h = Math.min(box.h, bounds.h);
  const x = Math.max(0, Math.min(box.x, bounds.w - w));
  const y = Math.max(0, Math.min(box.y, bounds.h - h));
  return { x, y, w, h };
}

const has = (handle: Handle, edge: "n" | "s" | "e" | "w") => handle.includes(edge);

export function resizeBox(
  box: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  opts: { aspect: number | null; minSize: number; bounds: Size },
): Rect {
  const { aspect, minSize, bounds } = opts;
  // Opposite edges stay fixed (anchor).
  const anchorRight = box.x + box.w;
  const anchorBottom = box.y + box.h;

  let w = box.w + (has(handle, "e") ? dx : 0) - (has(handle, "w") ? dx : 0);
  let h = box.h + (has(handle, "s") ? dy : 0) - (has(handle, "n") ? dy : 0);

  const horiz = has(handle, "e") || has(handle, "w");
  const vert = has(handle, "n") || has(handle, "s");

  w = Math.max(minSize, w);
  h = Math.max(minSize, h);

  if (aspect != null) {
    if (horiz && !vert) h = w / aspect; // E/W edge → width drives
    else if (vert && !horiz) w = h * aspect; // N/S edge → height drives
    else w = h === (w / aspect) ? w : ((h = w / aspect), w); // corner → width drives
    w = Math.max(minSize, w);
    h = Math.max(minSize, h);
  }

  // Position: fixed edge stays; moving edge derives from size.
  let x: number;
  if (has(handle, "w")) x = anchorRight - w;
  else if (has(handle, "e")) x = box.x;
  else x = box.x + (box.w - w) / 2; // N/S only: keep centered horizontally
  let y: number;
  if (has(handle, "n")) y = anchorBottom - h;
  else if (has(handle, "s")) y = box.y;
  else y = box.y + (box.h - h) / 2; // E/W only: keep centered vertically

  // Clamp growth against the fixed (anchor) edge rather than shifting the
  // whole box — generic clampBox would slide the anchor, which is wrong
  // for a resize (the opposite edge must stay put).
  if (has(handle, "w")) {
    if (x < 0) {
      w = anchorRight;
      x = 0;
    }
  } else if (has(handle, "e")) {
    if (x + w > bounds.w) w = bounds.w - x;
  } else {
    w = Math.min(w, bounds.w);
    x = Math.max(0, Math.min(x, bounds.w - w));
  }
  if (has(handle, "n")) {
    if (y < 0) {
      h = anchorBottom;
      y = 0;
    }
  } else if (has(handle, "s")) {
    if (y + h > bounds.h) h = bounds.h - y;
  } else {
    h = Math.min(h, bounds.h);
    y = Math.max(0, Math.min(y, bounds.h - h));
  }

  return { x, y, w, h };
}

export function screenToImage(pt: Point, view: View, origin: Point): Point {
  return { x: (pt.x - origin.x - view.panX) / view.zoom, y: (pt.y - origin.y - view.panY) / view.zoom };
}

export function imageToScreen(pt: Point, view: View, origin: Point): Point {
  return { x: pt.x * view.zoom + view.panX + origin.x, y: pt.y * view.zoom + view.panY + origin.y };
}

export function exportRect(crop: Rect, bounds: Size): Rect {
  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const w = Math.min(Math.round(crop.w), bounds.w - x);
  const h = Math.min(Math.round(crop.h), bounds.h - y);
  return { x, y, w, h };
}
