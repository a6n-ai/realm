# Custom Image Cropper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the react-easy-crop dialog with a hand-rolled cropper: pan, zoom, movable/resizable crop box (aspect presets + free-form), circle, flip H/V (live), 90°-step rotation, exporting an optimized WebP.

**Architecture:** Orientation (90°/flip) is pre-baked into an offscreen `orientedCanvas`, so all interaction is axis-aligned scale+translate — no live rotation math. A pure `crop-geometry.ts` module holds the math (unit-tested); a `use-cropper` hook owns state + pointer gestures; `image-cropper`/`crop-box` render the DOM overlay; the dialog hosts controls + export.

**Tech Stack:** React 19.2.4, pointer events, Canvas API, shadcn `Dialog`/`Button`/`Slider`/`Switch`, vitest.

## Global Constraints

- No cropper library. Remove `react-easy-crop` (no other consumer).
- Rotation is 90° steps only (`rot ∈ {0,90,180,270}`); no arbitrary angle.
- All coordinate math lives in `crop-geometry.ts` (pure, unit-tested); components/hook consume it. Crop is stored in **orientedCanvas pixel coords**.
- Orientation (rotate/flip) is baked into `orientedCanvas`; display + crop operate in that space.
- Aspect presets: Free (`aspect=null`, `round=false`), 1:1 (`1`), 16:9 (`16/9`), 4:3 (`4/3`), 3:2 (`3/2`), 9:16 (`9/16`) — all `round=false`; Circle (`aspect=1`, `round=true`).
- Optimize toggle (default ON): ON → downscale longest side ≤1600 (`fitWithin`) + WebP q0.82; OFF → no downscale + WebP q0.95. JPEG fallback when WebP `toBlob` null. Output `File` `<stem>.webp` (`.jpg` fallback).
- `ImageCropperDialog` keeps props `{ open, src, fileName?, onCancel, onApply }` and the inline-error + busy behavior. `ImageUploader`, upload route, storage, `dishes.image` unchanged.
- No `Co-Authored-By` trailer. Don't touch unrelated files.
- Only `crop-geometry.ts` is unit-tested; the canvas/pointer runtime is manual-E2E verified.

## File Structure

**Create:** `apps/web/components/files/cropper/crop-geometry.ts` (+ `.test.ts`), `use-cropper.ts`, `crop-box.tsx`, `image-cropper.tsx`.
**Modify:** `apps/web/components/files/image-cropper-dialog.tsx` (rewrite), `apps/web/lib/images/export-image.ts` (add `encodeCanvasToFile`, remove `exportImage`/`loadImage`/`ExportOptions`/`CropPixels`; keep `fitWithin`), `apps/web/package.json` (remove `react-easy-crop`).

---

### Task 1: `crop-geometry.ts` — pure math (TDD)

**Files:**
- Create: `apps/web/components/files/cropper/crop-geometry.ts`
- Test: `apps/web/components/files/cropper/crop-geometry.test.ts`

**Interfaces:**
- Produces:
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `type Size = { w: number; h: number }`; `type Point = { x: number; y: number }`
  - `type View = { zoom: number; panX: number; panY: number }`
  - `type Handle = "n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw"`
  - `orientedSize(srcW, srcH, rot): Size`
  - `fitBox(boundsW, boundsH, aspect: number | null): Rect`
  - `clampBox(box: Rect, bounds: Size): Rect`
  - `resizeBox(box: Rect, handle: Handle, dx: number, dy: number, opts: { aspect: number | null; minSize: number; bounds: Size }): Rect`
  - `screenToImage(pt: Point, view: View, origin: Point): Point`
  - `imageToScreen(pt: Point, view: View, origin: Point): Point`
  - `exportRect(crop: Rect, bounds: Size): Rect`

- [ ] **Step 1: Write the failing tests (authoritative — pin exact values)**

`apps/web/components/files/cropper/crop-geometry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { clampBox, exportRect, fitBox, imageToScreen, orientedSize, resizeBox, screenToImage } from "./crop-geometry";

describe("orientedSize", () => {
  it("keeps dims at 0/180, swaps at 90/270", () => {
    expect(orientedSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(orientedSize(400, 300, 180)).toEqual({ w: 400, h: 300 });
    expect(orientedSize(400, 300, 90)).toEqual({ w: 300, h: 400 });
    expect(orientedSize(400, 300, 270)).toEqual({ w: 300, h: 400 });
  });
});

describe("fitBox", () => {
  it("returns the full area for free (null) aspect", () => {
    expect(fitBox(400, 300, null)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it("centers the largest 1:1 box (width-bound landscape)", () => {
    expect(fitBox(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
  });
  it("centers a 16:9 box within a 4:3 area (width-bound)", () => {
    // w=400 -> h=225 <= 300 -> centered vertically
    expect(fitBox(400, 300, 16 / 9)).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
  });
});

describe("clampBox", () => {
  it("shrinks an over-large box then shifts inside bounds", () => {
    expect(clampBox({ x: -10, y: -10, w: 500, h: 500 }, { w: 400, h: 300 })).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it("shifts a box that overflows the right/bottom edges", () => {
    expect(clampBox({ x: 350, y: 250, w: 100, h: 100 }, { w: 400, h: 300 })).toEqual({ x: 300, y: 200, w: 100, h: 100 });
  });
});

describe("screenToImage / imageToScreen", () => {
  const view = { zoom: 2, panX: 10, panY: 20 };
  const origin = { x: 5, y: 5 };
  it("round-trips a point", () => {
    const img = screenToImage({ x: 105, y: 105 }, view, origin);
    expect(img).toEqual({ x: (105 - 5 - 10) / 2, y: (105 - 5 - 20) / 2 });
    const back = imageToScreen(img, view, origin);
    expect(back.x).toBeCloseTo(105);
    expect(back.y).toBeCloseTo(105);
  });
});

describe("exportRect", () => {
  it("rounds and clamps to bounds", () => {
    expect(exportRect({ x: 10.4, y: 20.6, w: 100.2, h: 50.9 }, { w: 200, h: 60 })).toEqual({ x: 10, y: 21, w: 100, h: 39 });
  });
});

describe("resizeBox", () => {
  const bounds = { w: 400, h: 300 };
  const box = { x: 100, y: 100, w: 100, h: 100 };
  it("free SE corner grows width+height by the delta", () => {
    expect(resizeBox(box, "se", 20, 40, { aspect: null, minSize: 10, bounds })).toEqual({ x: 100, y: 100, w: 120, h: 140 });
  });
  it("free E edge grows only width", () => {
    expect(resizeBox(box, "e", 30, 0, { aspect: null, minSize: 10, bounds })).toEqual({ x: 100, y: 100, w: 130, h: 100 });
  });
  it("free NW corner moves the top-left, opposite corner fixed", () => {
    // right=200, bottom=200 fixed; left=100-20=80, top=100-20=80
    expect(resizeBox(box, "nw", -20, -20, { aspect: null, minSize: 10, bounds })).toEqual({ x: 80, y: 80, w: 120, h: 120 });
  });
  it("aspect 1:1 SE corner keeps width==height (width drives)", () => {
    const r = resizeBox(box, "se", 40, 10, { aspect: 1, minSize: 10, bounds });
    expect(r.w).toBe(r.h);
    expect(r).toEqual({ x: 100, y: 100, w: 140, h: 140 });
  });
  it("enforces minSize on shrink", () => {
    const r = resizeBox(box, "se", -200, -200, { aspect: null, minSize: 10, bounds });
    expect(r).toEqual({ x: 100, y: 100, w: 10, h: 10 });
  });
  it("clamps growth to bounds", () => {
    const r = resizeBox({ x: 350, y: 250, w: 40, h: 40 }, "se", 100, 100, { aspect: null, minSize: 10, bounds });
    expect(r).toEqual({ x: 350, y: 250, w: 50, h: 50 });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter web test crop-geometry`
Expected: FAIL — cannot resolve `./crop-geometry`.

- [ ] **Step 3: Implement `crop-geometry.ts` to pass the tests**

The tests above are authoritative; make them all pass. Reference implementation:
```ts
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

  return clampBox({ x, y, w, h }, bounds);
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
```
If any test fails, the test's expected value governs — adjust the implementation (not the test). Record any change in your report.

- [ ] **Step 4: Run the tests to green**

Run: `pnpm --filter web test crop-geometry`
Expected: PASS (all cases). If a case is genuinely wrong (e.g. an unreachable expectation), STOP and report it rather than editing the test to match buggy code.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.
```bash
git add apps/web/components/files/cropper/crop-geometry.ts apps/web/components/files/cropper/crop-geometry.test.ts
git commit -m "feat(cropper): pure crop-geometry module with unit tests"
```

---

### Task 2: `use-cropper` hook + `crop-box` + `image-cropper` + `encodeCanvasToFile`

Additive (the current react-easy-crop dialog keeps working; Task 3 swaps it).

**Files:**
- Create: `apps/web/components/files/cropper/use-cropper.ts`
- Create: `apps/web/components/files/cropper/crop-box.tsx`
- Create: `apps/web/components/files/cropper/image-cropper.tsx`
- Modify: `apps/web/lib/images/export-image.ts` (add `encodeCanvasToFile`, keep everything else)

**Interfaces:**
- Consumes: everything from `./crop-geometry`; `fitWithin` from `@/lib/images/export-image`.
- Produces:
  - `encodeCanvasToFile(canvas: HTMLCanvasElement, opts?: { optimize?: boolean; fileName?: string }): Promise<File>`
  - `useCropper(opts: { src: string; aspect: number | null; round: boolean; optimize: boolean }): CropperApi` where
    `CropperApi = { orientedRef: RefObject<HTMLCanvasElement>; orientedSize: Size; view: View; crop: Rect; ready: boolean; rotate(dir: 1 | -1): void; flip(axis: "h" | "v"): void; setZoom(z: number): void; onImagePointerDown(e): void; onBoxPointerDown(e): void; onHandlePointerDown(e, handle: Handle): void; exportCanvas(): HTMLCanvasElement | null }`
  - `ImageCropper({ api }: { api: CropperApi })` — the viewport component.
  - `CropBox({ rect, round, onBoxPointerDown, onHandlePointerDown }: { rect: Rect; round: boolean; onBoxPointerDown; onHandlePointerDown })`.

- [ ] **Step 1: Add `encodeCanvasToFile` to `export-image.ts`**

Append (keep the existing `exportImage`/`fitWithin`/`encode`; use the distinct name `encodeCanvas`):
```ts
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
```

- [ ] **Step 2: Write the `use-cropper` hook**

`apps/web/components/files/cropper/use-cropper.ts`:
```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitWithin } from "@/lib/images/export-image";
import {
  type Handle,
  type Point,
  type Rect,
  type Size,
  clampBox,
  exportRect,
  fitBox,
  orientedSize,
  screenToImage,
} from "./crop-geometry";

const MIN_SIZE = 24;

type Orientation = { rot: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean };
type View = { zoom: number; panX: number; panY: number };

export interface CropperApi {
  orientedRef: React.RefObject<HTMLCanvasElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  orientedSize: Size;
  view: View;
  crop: Rect;
  round: boolean;
  ready: boolean;
  rotate: (dir: 1 | -1) => void;
  flip: (axis: "h" | "v") => void;
  setZoom: (z: number) => void;
  onImagePointerDown: (e: React.PointerEvent) => void;
  onBoxPointerDown: (e: React.PointerEvent) => void;
  onHandlePointerDown: (e: React.PointerEvent, handle: Handle) => void;
  exportCanvas: () => HTMLCanvasElement | null;
}

// Draw the source image into `canvas` applying 90°-rotation + flips.
function renderOriented(canvas: HTMLCanvasElement, img: HTMLImageElement, o: Orientation): Size {
  const size = orientedSize(img.width, img.height, o.rot);
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return size;
  ctx.save();
  ctx.translate(size.w / 2, size.h / 2);
  ctx.rotate((o.rot * Math.PI) / 180);
  ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
  return size;
}

export function useCropper(opts: { src: string; aspect: number | null; round: boolean; optimize: boolean }): CropperApi {
  const orientedRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const gesture = useRef<
    | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { kind: "move"; startX: number; startY: number; crop: Rect }
    | { kind: "resize"; handle: Handle; startX: number; startY: number; crop: Rect }
    | null
  >(null);

  const [orientation, setOrientation] = useState<Orientation>({ rot: 0, flipH: false, flipV: false });
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  // Fit the oriented image into the viewport and center it.
  const fitView = useCallback((s: Size) => {
    const vp = viewportRef.current;
    if (!vp || s.w === 0) return { zoom: 1, panX: 0, panY: 0 };
    const zoom = Math.min(vp.clientWidth / s.w, vp.clientHeight / s.h);
    return { zoom, panX: (vp.clientWidth - s.w * zoom) / 2, panY: (vp.clientHeight - s.h * zoom) / 2 };
  }, []);

  // (Re)render orientedCanvas + refit crop/view whenever src or orientation changes.
  const rebuild = useCallback(
    (o: Orientation) => {
      const img = imgRef.current;
      const canvas = orientedRef.current;
      if (!img || !canvas) return;
      const s = renderOriented(canvas, img, o);
      setSize(s);
      setView(fitView(s));
      setCrop(fitBox(s.w, s.h, opts.aspect));
    },
    [fitView, opts.aspect],
  );

  // Load the image.
  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      rebuild(orientation);
      setReady(true);
    };
    img.src = opts.src;
    return () => {
      img.onload = null;
    };
    // rebuild on src only; orientation handled by its own handlers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.src]);

  // Re-apply aspect to the crop box when the preset changes.
  useEffect(() => {
    if (!ready) return;
    setCrop((c) => clampBox(fitBox(size.w, size.h, opts.aspect), size) && applyAspectToExisting(c, opts.aspect, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.aspect, opts.round]);

  const rotate = useCallback(
    (dir: 1 | -1) => {
      setOrientation((o) => {
        const next: Orientation = { ...o, rot: (((o.rot + dir * 90) % 360) + 360) % 360 as Orientation["rot"] };
        rebuild(next);
        return next;
      });
    },
    [rebuild],
  );

  const flip = useCallback(
    (axis: "h" | "v") => {
      setOrientation((o) => {
        const next: Orientation = axis === "h" ? { ...o, flipH: !o.flipH } : { ...o, flipV: !o.flipV };
        rebuild(next);
        return next;
      });
    },
    [rebuild],
  );

  const setZoom = useCallback(
    (z: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      setView((v) => {
        // zoom about viewport center
        const cx = vp.clientWidth / 2;
        const cy = vp.clientHeight / 2;
        const imgX = (cx - v.panX) / v.zoom;
        const imgY = (cy - v.panY) / v.zoom;
        return { zoom: z, panX: cx - imgX * z, panY: cy - imgY * z };
      });
    },
    [],
  );

  const origin = useCallback((): Point => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  }, []);

  const onImagePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
  }, [view.panX, view.panY]);

  const onBoxPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    gesture.current = { kind: "move", startX: e.clientX, startY: e.clientY, crop };
  }, [crop]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    gesture.current = { kind: "resize", handle, startX: e.clientX, startY: e.clientY, crop };
  }, [crop]);

  // Global pointer move/up while a gesture is active.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      const dxS = e.clientX - g.startX;
      const dyS = e.clientY - g.startY;
      if (g.kind === "pan") {
        setView((v) => ({ ...v, panX: g.panX + dxS, panY: g.panY + dyS }));
      } else if (g.kind === "move") {
        const dx = dxS / view.zoom;
        const dy = dyS / view.zoom;
        setCrop(clampBox({ ...g.crop, x: g.crop.x + dx, y: g.crop.y + dy }, size));
      } else {
        const dx = dxS / view.zoom;
        const dy = dyS / view.zoom;
        // resizeBox is imported lazily to keep this effect lean
        setCrop(resizeFromGeometry(g.crop, g.handle, dx, dy, opts.aspect, MIN_SIZE, size));
      }
    }
    function onUp() {
      gesture.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [view.zoom, size, opts.aspect]);

  const exportCanvas = useCallback((): HTMLCanvasElement | null => {
    const oriented = orientedRef.current;
    if (!oriented) return null;
    const rect = exportRect(crop, size);
    const out = document.createElement("canvas");
    const fit = fitWithin(rect.w, rect.h, opts.optimize ? 1600 : Number.POSITIVE_INFINITY);
    out.width = fit.w;
    out.height = fit.h;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    if (opts.round) {
      ctx.beginPath();
      ctx.ellipse(fit.w / 2, fit.h / 2, fit.w / 2, fit.h / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(oriented, rect.x, rect.y, rect.w, rect.h, 0, 0, fit.w, fit.h);
    return out;
  }, [crop, size, opts.optimize, opts.round]);

  return useMemo(
    () => ({
      orientedRef,
      viewportRef,
      orientedSize: size,
      view,
      crop,
      round: opts.round,
      ready,
      rotate,
      flip,
      setZoom,
      onImagePointerDown,
      onBoxPointerDown,
      onHandlePointerDown,
      exportCanvas,
    }),
    [size, view, crop, opts.round, ready, rotate, flip, setZoom, onImagePointerDown, onBoxPointerDown, onHandlePointerDown, exportCanvas],
  );
}
```
This hook references two small local helpers — add them at the top of the file (below the imports), so the file is self-contained:
```ts
import { resizeBox } from "./crop-geometry";

function resizeFromGeometry(crop: Rect, handle: Handle, dx: number, dy: number, aspect: number | null, minSize: number, bounds: Size): Rect {
  return resizeBox(crop, handle, dx, dy, { aspect, minSize, bounds });
}

function applyAspectToExisting(crop: Rect, aspect: number | null, bounds: Size): Rect {
  if (aspect == null) return clampBox(crop, bounds);
  // keep top-left, force the aspect on width, clamp
  const w = crop.w;
  const h = w / aspect;
  return clampBox({ x: crop.x, y: crop.y, w, h }, bounds);
}
```
(Adjust imports so `resizeBox`, `clampBox`, `exportRect`, `fitBox`, `orientedSize`, `screenToImage`, and the types are all imported once from `./crop-geometry`; remove the unused `screenToImage` import if lint flags it — it is only needed if you compute image-space pointer positions directly.)

- [ ] **Step 3: Write `crop-box.tsx`**

`apps/web/components/files/cropper/crop-box.tsx`:
```tsx
"use client";

import type { Handle, Rect } from "./crop-geometry";
import { cn } from "@/lib/utils";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const POS: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

export function CropBox({
  rect,
  round,
  onBoxPointerDown,
  onHandlePointerDown,
}: {
  rect: Rect; // in SCREEN coords relative to the viewport
  round: boolean;
  onBoxPointerDown: (e: React.PointerEvent) => void;
  onHandlePointerDown: (e: React.PointerEvent, handle: Handle) => void;
}) {
  return (
    <div
      className={cn(
        "absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]",
        round && "rounded-full",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, touchAction: "none" }}
      onPointerDown={onBoxPointerDown}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          data-handle={h}
          onPointerDown={(e) => onHandlePointerDown(e, h)}
          className={cn("absolute size-3 rounded-full border border-white bg-primary", POS[h])}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `image-cropper.tsx`**

`apps/web/components/files/cropper/image-cropper.tsx`:
```tsx
"use client";

import { imageToScreen } from "./crop-geometry";
import type { CropperApi } from "./use-cropper";
import { CropBox } from "./crop-box";

export function ImageCropper({ api }: { api: CropperApi }) {
  // Crop rect (image space) → screen rect relative to the viewport (origin 0,0).
  const tl = imageToScreen({ x: api.crop.x, y: api.crop.y }, api.view, { x: 0, y: 0 });
  const screenRect = { x: tl.x, y: tl.y, w: api.crop.w * api.view.zoom, h: api.crop.h * api.view.zoom };

  return (
    <div
      ref={api.viewportRef}
      className="bg-muted relative h-72 w-full overflow-hidden rounded-md"
      style={{ touchAction: "none" }}
      onPointerDown={api.onImagePointerDown}
    >
      <canvas
        ref={api.orientedRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${api.view.panX}px, ${api.view.panY}px) scale(${api.view.zoom})` }}
      />
      {api.ready ? (
        <CropBox
          rect={screenRect}
          round={api.round}
          onBoxPointerDown={api.onBoxPointerDown}
          onHandlePointerDown={api.onHandlePointerDown}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. (These are new, unused-by-the-app-yet modules; Task 3 wires them in. If `typecheck` flags an unused import, remove it.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/files/cropper/use-cropper.ts apps/web/components/files/cropper/crop-box.tsx apps/web/components/files/cropper/image-cropper.tsx apps/web/lib/images/export-image.ts
git commit -m "feat(cropper): useCropper hook + crop-box/image-cropper views + encodeCanvasToFile"
```

---

### Task 3: Dialog rewrite + remove react-easy-crop / old export

**Files:**
- Modify: `apps/web/components/files/image-cropper-dialog.tsx` (rewrite)
- Modify: `apps/web/lib/images/export-image.ts` (remove old exports)
- Modify: `apps/web/package.json` (remove `react-easy-crop`)

**Interfaces:**
- Consumes: `useCropper` + `ImageCropper` from `./cropper/*`; `encodeCanvasToFile` from `@/lib/images/export-image`.
- Produces: `ImageCropperDialog({ open, src, fileName?, onCancel, onApply })` (unchanged signature).

- [ ] **Step 1: Rewrite the dialog**

Replace the entire contents of `apps/web/components/files/image-cropper-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";
import { FlipHorizontalIcon, FlipVerticalIcon, Loader2Icon, RotateCcwIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { encodeCanvasToFile } from "@/lib/images/export-image";
import { ImageCropper } from "./cropper/image-cropper";
import { useCropper } from "./cropper/use-cropper";

type Preset = { label: string; aspect: number | null; round: boolean };
const PRESETS: Preset[] = [
  { label: "Free", aspect: null, round: false },
  { label: "1:1", aspect: 1, round: false },
  { label: "16:9", aspect: 16 / 9, round: false },
  { label: "4:3", aspect: 4 / 3, round: false },
  { label: "3:2", aspect: 3 / 2, round: false },
  { label: "9:16", aspect: 9 / 16, round: false },
  { label: "Circle", aspect: 1, round: true },
];

export function ImageCropperDialog({
  open,
  src,
  fileName,
  onCancel,
  onApply,
}: {
  open: boolean;
  src: string;
  fileName?: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const [presetIdx, setPresetIdx] = useState(1); // default 1:1
  const [zoom, setZoom] = useState(1);
  const [optimize, setOptimize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS[presetIdx] ?? PRESETS[0]!;
  const api = useCropper({ src, aspect: preset.aspect, round: preset.round, optimize });

  function pickPreset(i: number) {
    setPresetIdx(i);
  }
  function changeZoom(z: number) {
    setZoom(z);
    api.setZoom(z);
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const canvas = api.exportCanvas();
      if (!canvas) throw new Error("Could not process image");
      const file = await encodeCanvasToFile(canvas, { optimize, fileName });
      onApply(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
        </DialogHeader>

        <ImageCropper api={api} />

        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => (
              <Button key={p.label} type="button" size="sm" variant={i === presetIdx ? "default" : "outline"} onClick={() => pickPreset(i)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Zoom</Label>
            <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={(v) => changeZoom(v[0] ?? 1)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => api.rotate(-1)}>
              <RotateCcwIcon className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => api.rotate(1)}>
              <RotateCwIcon className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => api.flip("h")}>
              <FlipHorizontalIcon className="size-4" /> Flip H
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => api.flip("v")}>
              <FlipVerticalIcon className="size-4" /> Flip V
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch checked={optimize} onCheckedChange={setOptimize} /> Optimize
            </label>
          </div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={busy || !api.ready}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null} Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
If a lucide flip-icon name differs in the installed version, adapt and note it.

- [ ] **Step 2: Remove the old geometry from `export-image.ts`**

Edit `apps/web/lib/images/export-image.ts`: delete `exportImage`, `loadImage`, the old `encode` helper, `toRad`, and the `ExportOptions`/`CropPixels` interfaces. **Keep** `fitWithin`, `encodeCanvas`, and `encodeCanvasToFile`. (`fitWithin` is still used by `use-cropper`; its test stays.)

- [ ] **Step 3: Remove react-easy-crop**

Run (from `apps/web`): `pnpm remove react-easy-crop`

- [ ] **Step 4: Confirm no stale references**

Run: `rg -n "react-easy-crop|exportImage\b|ExportOptions|CropPixels|loadImage" apps/web --glob '!*.next*'`
Expected: NO matches. Fix any that remain.

- [ ] **Step 5: Typecheck + geometry tests**

Run: `pnpm --filter web typecheck`
Expected: PASS.
Run: `pnpm --filter web test crop-geometry export-image`
Expected: PASS.

- [ ] **Step 6: Manual end-to-end (real browser)**

Start dev: `DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' pnpm --filter web dev`
Sign in as admin → `/dashboard/catalog/dishes` → edit a dish → Choose image → in the cropper:
- **Flip H**, then **Flip V** — the image mirrors immediately (live).
- Drag the crop box + its handles; **Free** → arbitrary rectangle; **16:9** → widescreen box; **Circle** → round box.
- **Rotate ↺/↻** (90° steps); **Zoom** slider; drag the image to pan.
- **Apply** (Optimize ON). Confirm upload + preview + table thumbnail render, and the stored file is WebP:
```bash
cd apps/web && DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' node --input-type=module -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const r=await sql\`select name, image from dishes where image is not null order by updated_at desc limit 1\`; console.log(JSON.stringify(r[0],null,2)); await sql.end();"
```
Expected: newest `image.url` ends `.webp`. Repeat with a Free crop + Optimize OFF.
(If you cannot drive a browser, do the static checks — typecheck, rg-clean, tests — and report the manual E2E was NOT run so the controller/user runs it.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/files/image-cropper-dialog.tsx apps/web/lib/images/export-image.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(files): custom cropper dialog (presets, free/circle, live flip, 90° rotate); drop react-easy-crop"
```

---

## Self-Review

**Spec coverage:**
- §1 file structure (cropper/ folder + dialog + export-image) → Tasks 1–3. ✓
- §2 state & coordinate model → Task 2 `use-cropper` + `crop-geometry`. ✓
- §3 pure geometry + tests → Task 1. ✓
- §4 rendering (viewport, transformed orientedCanvas, crop-box overlay, pointer) → Task 2 (`image-cropper`, `crop-box`, hook gestures). ✓
- §5 orientation & controls (rotate/flip/presets/zoom/optimize) → Task 2 hook + Task 3 dialog. ✓
- §6 export (exportRect → output canvas → encodeCanvasToFile) → Task 2 `exportCanvas` + `encodeCanvasToFile`, Task 3 dialog Apply. ✓
- §7 unchanged (ImageUploader/route/storage) → untouched. ✓
- Remove react-easy-crop → Task 3. ✓

**Placeholder scan:** No TBD/TODO. Geometry is TDD with pinned expected values (tests authoritative). Component code is complete; lucide-icon-name uncertainty carries an adapt note.

**Type consistency:** `Rect`/`Size`/`Point`/`View`/`Handle` defined in `crop-geometry.ts` (Task 1), consumed by hook/components (Task 2). `CropperApi` defined in `use-cropper` (Task 2), consumed by `ImageCropper` + the dialog (Tasks 2,3). `encodeCanvasToFile(canvas, { optimize?, fileName? })` defined Task 2, used Task 3. `ImageCropperDialog` props unchanged (ImageUploader untouched). Presets identical in dialog (Task 3) to the spec.

## Success Criteria

- No cropper library; `react-easy-crop`/`exportImage` gone.
- Flip live; aspect presets + free-form + circle work; 90° rotate; pan + zoom.
- Apply → optimized WebP via `exportCanvas` + `encodeCanvasToFile`; upload/render/DB unchanged.
- `crop-geometry` unit tests pass; `pnpm --filter web typecheck` passes.
