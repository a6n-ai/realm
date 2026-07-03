# Custom Image Cropper — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan

## Purpose

Replace the `react-easy-crop`-based `ImageCropperDialog` with a **hand-rolled**
cropper (no cropper library), giving: pan, zoom, a movable/resizable crop box with
**aspect presets** (1:1, 16:9, 4:3, 3:2, 9:16), **free-form** crop, **circle** crop,
**flip H/V** (live), and **90°-step rotation**. The user chose to own the cropper
rather than depend on a library. Everything downstream — `ImageUploader`, the upload
route, storage, `dishes.image` — is unchanged.

## Decisions (from brainstorming)

- **Own it** — no `react-easy-crop`, no `react-advanced-cropper`.
- **Rotation = 90° steps only** (no arbitrary angle) — keeps crop math axis-aligned.
- Features: pan, zoom, crop box (aspect presets + free), circle, flip H/V, 90° rotate,
  Optimize toggle.
- Hybrid model: DOM overlay for interaction + an offscreen canvas for export.

## Core idea: pre-baked orientation

The only transforms that rotate pixels are 90° rotation and flips — all axis-aligned.
Bake them into an offscreen **`orientedCanvas`** (the source image drawn with the
current `{rot, flipH, flipV}`). Everything interactive (display, crop box) then works
in `orientedCanvas` pixel space with **pure scale + translate** — no live rotation
math anywhere. Export samples the crop rectangle directly from `orientedCanvas`.

## §1 — File structure

`apps/web/components/files/cropper/`:
- `crop-geometry.ts` (+ `crop-geometry.test.ts`) — pure math (the unit-tested core).
- `use-cropper.ts` — a hook owning cropper state + pointer handlers; returns state +
  handlers + an `exportCanvas()` that produces the cropped output canvas.
- `image-cropper.tsx` — the viewport component: renders `orientedCanvas`, the crop-box
  overlay + handles + dim mask, wires pointer events from the hook.
- `crop-box.tsx` — the crop-box overlay (8 handles + move region + circle rendering).

Modified:
- `apps/web/components/files/image-cropper-dialog.tsx` — rewritten shell (presets,
  rotate/flip/zoom/optimize controls, Cancel/Apply) hosting `image-cropper` + export.
- `apps/web/lib/images/export-image.ts` — re-add `encodeCanvasToFile` + keep `fitWithin`;
  delete the old `exportImage`/`loadImage`/`ExportOptions`/`CropPixels` (react-easy-crop
  geometry). `export-image.test.ts` keeps its `fitWithin` tests.
- `apps/web/package.json` — remove `react-easy-crop`.

## §2 — State & coordinate model

`use-cropper.ts` state:
```
orientation: { rot: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean }
view:        { zoom: number; panX: number; panY: number }   // display transform of orientedCanvas
crop:        { x: number; y: number; w: number; h: number }  // in orientedCanvas PIXEL coords
aspect:      number | null                                    // null = free
round:       boolean
```
- `orientedCanvas` (a `useRef<HTMLCanvasElement>`) holds the oriented image;
  `orientedSize = { w, h }` its pixel dims.
- Display: the orientedCanvas is shown in the viewport scaled by `view.zoom` and offset
  by `view.pan`. Screen→image: `imgX = (screenX - viewportLeft - panX) / zoom`
  (and y analogously). image→screen is the inverse. These conversions live in
  `crop-geometry.ts`.

## §3 — Pure geometry (`crop-geometry.ts`) — the tested core

Exported pure functions (all operate in orientedCanvas pixel space unless noted):
- `orientedSize(srcW, srcH, rot): { w, h }` — swaps dims for 90/270.
- `fitBox(orientedW, orientedH, aspect): Rect` — the initial/refit crop box: the largest
  `aspect`-ratio (or full for free) rectangle centered in the oriented image.
- `clampBox(box, bounds): Rect` — keep a box within `{w,h}` bounds (shift, then shrink).
- `resizeBox(box, handle, dx, dy, opts): Rect` — apply a pointer delta to one of 8
  handles; if `opts.aspect` set, lock ratio; enforce `opts.minSize`; clamp to
  `opts.bounds`. `handle ∈ {n,s,e,w,ne,nw,se,sw}`.
- `screenToImage(pt, view, viewportOrigin): Point` and `imageToScreen(pt, view, viewportOrigin): Point`.
- `exportRect(crop, orientedSize): Rect` — the integer pixel rect to sample (rounded,
  clamped to bounds).

`crop-geometry.test.ts` asserts: `orientedSize` dim-swap at 90/270; `fitBox` centering +
aspect; `clampBox` shift-then-shrink; `resizeBox` aspect lock on a corner + min-size floor
+ bounds clamp; `screenToImage`/`imageToScreen` round-trip; `exportRect` rounding/clamp.

## §4 — Rendering (`image-cropper.tsx` + `crop-box.tsx`)

- Viewport: a `relative` div, fixed height (≈`h-72`), `overflow-hidden`, `touch-none`.
- Image: render `orientedCanvas` via a `<canvas>` element (the same ref) positioned with
  `transform: translate(panX,panY) scale(zoom)` and `transform-origin: 0 0`.
- Crop box: an absolutely-positioned div at the image→screen rect of `crop`, with a
  `box-shadow: 0 0 0 9999px rgba(0,0,0,.5)` dim mask, a grid/border, 8 handle divs, and
  `border-radius: 9999px` when `round`.
- Pointer: `onPointerDown` on the image → pan; on the box body → move; on a handle →
  resize (handle id via `data-handle`). `use-cropper` tracks the active gesture and
  updates `view`/`crop` through the geometry fns. `setPointerCapture` for smooth drags.

## §5 — Orientation & controls

- **Rotate 90° ↺ / ↻**: `rot = (rot ± 90) mod 360`; rebuild `orientedCanvas`
  (draw source with rotation+flips), recompute `orientedSize`, `crop = fitBox(...)`,
  reset `view` to fit. Live.
- **Flip H / Flip V**: toggle `flipH`/`flipV`; rebuild `orientedCanvas`; keep crop if
  in-bounds else refit. Live in the viewfinder (fixes the reported bug by construction).
- **Aspect presets**: Free (`aspect=null`, `round=false`), 1:1, 16:9, 4:3, 3:2, 9:16
  (`aspect=number`, `round=false`), Circle (`aspect=1`, `round=true`). On change,
  `crop = clampBox(applyAspect(crop, aspect), bounds)` (or `fitBox` if the current crop
  can't satisfy the new ratio). Active preset highlighted.
- **Zoom**: slider (1–4) + wheel; zoom about the viewport center; clamp pan so the image
  stays reasonable.
- **Optimize** toggle (default ON).

## §6 — Export

`use-cropper.exportCanvas(): HTMLCanvasElement`:
1. `rect = exportRect(crop, orientedSize)`.
2. Output canvas sized to `fitWithin(rect.w, rect.h, optimize ? 1600 : Infinity)`.
3. If `round`, ellipse-clip the output.
4. `drawImage(orientedCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h)`.
5. Return the canvas.

Dialog Apply: `const canvas = exportCanvas(); const file = await encodeCanvasToFile(canvas, { optimize, fileName }); onApply(file);` — wrapped in try/catch → inline error, `busy` in `finally` (same UX as today).

`encodeCanvasToFile(canvas, { optimize?, fileName? })`: WebP at q0.82 (optimize) / q0.95
(off) via `canvas.toBlob`; JPEG fallback; File `<stem>.webp` / `.jpg`.

## §7 — Unchanged

`ImageUploader` (still receives a `File` from `onApply`), `POST /api/files/upload`,
`GET /api/files/[...key]`, storage, table thumbnail, `dishes.image` FileDetail. No
route/schema/storage change.

## Out of scope / ponytail

- Arbitrary-angle rotation (chosen 90° steps).
- Persisting transform params for non-destructive re-edit (bake stays destructive).
- Advanced touch gestures (pinch-zoom) — pointer drag + slider zoom only; pointer events
  already cover single-touch.
- `exportCanvas`, pointer interaction, and `orientedCanvas` rebuild need a real canvas →
  covered by manual E2E, not jsdom. Only `crop-geometry.ts` is unit-tested.

## Testing

- `crop-geometry.test.ts` — the pure-math cases in §3.
- Manual E2E (real browser): flip H/V mirror live; presets change the box ratio; Free →
  drag an arbitrary rectangle via handles; Circle → round; rotate 90°; zoom/pan; Apply
  (Optimize on) → stored WebP renders in dialog preview + table thumbnail; repeat with a
  free crop + Optimize off.

## Success criteria

- No cropper library; `react-easy-crop` removed.
- Flip live in the viewfinder; aspect presets + free-form + circle all work; 90° rotate;
  pan + zoom.
- Apply produces an optimized WebP; upload/render/DB unchanged.
- `crop-geometry` unit tests pass; `pnpm --filter web typecheck` passes.
