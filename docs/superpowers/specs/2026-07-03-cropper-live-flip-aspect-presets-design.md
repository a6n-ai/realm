# Cropper Upgrade — Live Flip, Aspect Presets, Free Crop — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan

## Purpose

Fix two gaps in the image cropper shipped in the transforms feature:
1. **Flip H / Flip V do not update the viewfinder** — they were baked at export only,
   so the user gets no live feedback.
2. **Only square (1:1) crop** — users need aspect presets (16:9 widescreen, 4:3, 3:2,
   9:16), a **free ratio**, and a **free-form crop**.

`react-easy-crop` (current) cannot do either well: it requires a fixed `aspect` (no
free crop) and has no live flip. Swap to `react-advanced-cropper`, which supports
flip + rotate with live preview, free and fixed aspect, a circle stencil, and returns
the transformed+cropped canvas via `getCanvas()` — which also simplifies our export.

## §1 — Library swap

- Remove `react-easy-crop` from `apps/web/package.json` (no other consumer).
- Add `react-advanced-cropper` (confirm current version at install).
- Import its stylesheet in the dialog module: `import "react-advanced-cropper/dist/style.css"`
  (Next allows node_modules CSS imports inside a client component).

## §2 — `ImageCropperDialog` rewrite

File: `apps/web/components/files/image-cropper-dialog.tsx`. Same props
(`{ open, src, fileName?, onCancel, onApply }`), same shadcn Dialog shell + Cancel/Apply
+ inline error (from the earlier fix). Internals:

- `const cropperRef = useRef<CropperRef>(null)`.
- `<Cropper ref={cropperRef} src={src} stencilComponent={round ? CircleStencil : RectangleStencil} stencilProps={aspect ? { aspectRatio: aspect } : {}} className="h-64 w-full" />`
  (import `Cropper`, `CropperRef`, `RectangleStencil`, `CircleStencil` from `react-advanced-cropper`).
- **Aspect presets** — a button row; each sets `aspect: number | undefined` and `round: boolean`:
  - **Free** → `aspect=undefined`, `round=false` (free-form rectangle, the stencil's default).
  - **1:1** → `1`, **16:9** → `16/9`, **4:3** → `4/3`, **3:2** → `3/2`, **9:16** → `9/16`, all `round=false`.
  - **Circle** → `round=true` (CircleStencil, fixed 1:1).
  - Active preset is visually highlighted (button `variant="default"` when selected).
- **Flip H / Flip V** buttons → `cropperRef.current?.flip(true, false)` / `flip(false, true)`.
  Live in the viewfinder (the library re-renders the image). No client-side flip state needed
  for export — the crop result already reflects it via `getCanvas`.
- **Rotate** — a "90°" button → `cropperRef.current?.rotate(90)`; plus a fine slider (0–360)
  that applies the delta: on change to `next`, call `rotate(next - rotation)` and store
  `rotation = next`. (`rotate` is relative in this library.)
- **Optimize for web** toggle (default ON) — unchanged.
- **Apply**: build draw options — `optimize ? { maxWidth: 1600, maxHeight: 1600, imageSmoothingQuality: "high" } : {}` —
  `const canvas = cropperRef.current?.getCanvas(drawOptions)`; if null → set error and stop;
  else `const file = await encodeCanvasToFile(canvas, { optimize, fileName })`; `onApply(file)`.
  Keep the `try/catch` → inline error and `busy` reset in `finally`.

## §3 — Export refactor (`export-image.ts`)

`react-advanced-cropper`'s `getCanvas` already applies crop + rotation + flips and can
downscale (`maxWidth`/`maxHeight`), so the manual bounding-box/rotation/crop geometry is
no longer needed. Replace the module's public surface:

- **Remove** `exportImage`, `fitWithin`, `loadImage`, and the `ExportOptions`/`CropPixels`
  interfaces (and `export-image.test.ts`, which only covered `fitWithin`).
- **Add** `encodeCanvasToFile(canvas: HTMLCanvasElement, opts: { optimize?: boolean; fileName?: string }): Promise<File>`:
  - `quality = opts.optimize === false ? 0.95 : 0.82`.
  - `canvas.toBlob(_, "image/webp", quality)`; on null blob, fall back to `image/jpeg` at
    the same quality; throw if both null.
  - Return `new File([blob], \`${opts.fileName ?? "image"}.webp\`, { type: "image/webp" })`
    (`.jpg` / `image/jpeg` on the fallback).

## §4 — Unchanged

`ImageUploader` (receives a `File` from `onApply` exactly as before), the upload route
(`POST /api/files/upload`), storage, `GET /api/files/[...key]`, the table thumbnail, and
`dishes.image` FileDetail JSON. No route/schema/storage change.

## Out of scope / ponytail

- **No automated unit test** — this removes `fitWithin` (the only jsdom-testable piece);
  `encodeCanvasToFile` and the cropper both need a real canvas. Verified by manual E2E.
- Threading `shape`/aspect presets into other future uploaders (avatar/banner) — the presets
  live in the dialog and apply to every consumer already; no per-caller wiring here.
- Persisting the chosen transform params (non-destructive re-edit) remains out of scope —
  bake stays destructive.

## Testing

Manual E2E (real browser):
- Flip H then Flip V — the viewfinder image mirrors immediately (the reported bug).
- Switch aspect: 16:9 → crop box is widescreen; Free → drag an arbitrary rectangle;
  Circle → round stencil.
- Rotate 90° + slider — image rotates live.
- Apply (Optimize ON) → stored file is WebP, smaller than source, renders in dialog preview
  + table thumbnail. Repeat once with a free-form crop and Optimize OFF.

## Success criteria

- Flip H/V visibly update the cropper preview.
- Aspect presets (1:1, 16:9, 4:3, 3:2, 9:16), Free ratio, and Circle all selectable and
  reflected in the crop box; free-form crop works.
- Apply produces an optimized WebP via `getCanvas` + `encodeCanvasToFile`; upload/render/DB
  unchanged.
- `react-easy-crop` removed; `pnpm --filter web typecheck` passes.
