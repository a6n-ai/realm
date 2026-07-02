# Image Transforms + Optimization at Upload — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan

## Purpose

Let users crop, rotate, circle-crop, and flip an image before it uploads, and
optimize the result (downscale + WebP) — mirroring the *intent* of nocode-saas's
image transforms but done **client-side at upload** (bake the result) rather than
server-side on read. Keeps the existing `POST /api/files/upload` +
`GET /api/files/[...key]` + FileDetail-jsonb storage unchanged; only the client
upload flow gains a cropper step.

## Reference: nocode-saas

`files/util/ImageTransformUtil.java` transforms server-side (ImageIO/Scalr):
`ImageDetails` = width/height, rotation, cropAreaX/Y/Width/Height, flipHorizontal,
flipVertical, backgroundColor; pipeline scale → flip → rotate → crop. No true
circle crop (circle is a display treatment there). We take the same transform set
but apply it in a browser canvas and bake the output; we add a real circular crop.

## Decisions (from brainstorming)

- **Client bake at upload** — export the adjusted image; no stored transform params,
  no server `sharp`, no transform route.
- Transforms: **crop, rotate (any angle), circle crop, flip H/V**.
- **Optimize on export**: downscale to a max dimension + encode WebP via
  `canvas.toBlob(_, "image/webp", quality)` (native, no extra lib).
- Cropper library: **`react-easy-crop`** (crop + pan + zoom + `rotation` +
  `cropShape="round"`).

## §1 — Flow

`ImageUploadField` currently uploads the raw selected file. New flow:
1. File selected (diceui `onUpload`) → do NOT upload yet; stash the `File` + the
   diceui `options` (`onSuccess`/`onError`) and open `ImageCropperDialog` with an
   object URL of the file.
2. User adjusts; on **Apply**, `exportImage(...)` produces an optimized WebP `File`.
3. Run the existing `upload(webpFile, options)` (unchanged fetch to
   `/api/files/upload`) → `onChange(FileDetail)`.
4. On **Cancel**, call `options.onError(file, new Error("cancelled"))` (or a no-op
   success) so diceui's internal file-state clears, and revoke the object URL.
   Always revoke the object URL when the dialog closes.

Server route, storage, serving, table thumbnail: unchanged. WebP is already in the
route's allowed MIME set and ≤5 MB.

## §2 — Cropper dialog

`apps/web/components/ds/image-cropper-dialog.tsx` — a `Dialog` wrapping
`react-easy-crop`:
- Props: `open`, `src` (object URL), `onCancel()`, `onApply(file: File)`,
  `fileName` (for the output stem).
- State: `crop {x,y}`, `zoom`, `rotation`, `flipH`, `flipV`, `round`,
  `croppedAreaPixels` (from `onCropComplete`). `aspect` fixed to `1` by default
  (square) with the round toggle switching `cropShape` between `"rect"`/`"round"`.
- Controls (shadcn primitives): zoom slider, rotation slider + two 90° buttons,
  flip-H / flip-V toggle buttons, a round toggle, an **"Optimize for web" toggle
  (default ON)**, Cancel / Apply.
- Flip preview: apply a CSS `transform: scaleX/scaleY(-1)` to the cropper media via
  react-easy-crop's `style`/`mediaProps` (or a wrapping transform) so the preview
  matches what export will bake. Export applies the same flips authoritatively.
- On Apply: call `exportImage(src, { cropPixels: croppedAreaPixels, rotation,
  flipH, flipV, round, maxDim: 1600, quality: 0.82 })` and hand the resulting File
  to `onApply`.

## §3 — Export + optimize

`apps/web/lib/images/export-image.ts`:

```
export interface ExportOptions {
  cropPixels: { x: number; y: number; width: number; height: number };
  rotation?: number;   // degrees
  flipH?: boolean;
  flipV?: boolean;
  round?: boolean;
  optimize?: boolean;  // default true; from the dialog's "Optimize for web" toggle
  fileName?: string;   // stem; output is `<stem>.webp`
}
export function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number };
export async function exportImage(src: string, opts: ExportOptions): Promise<File>;
```

- `fitWithin` — pure downscale math: if `max(w,h) <= maxDim` return `{w,h}`, else
  scale both by `maxDim / max(w,h)`, rounded. **Unit-tested.**
- `exportImage`:
  1. Load `src` into an `Image`.
  2. Draw into an intermediate canvas applying `rotation` (about center) and flips
     (`ctx.scale(±1, ±1)`).
  3. Extract the `cropPixels` rectangle. **Optimize toggle:** when `optimize` (default),
     output size = `fitWithin(cropWidth, cropHeight, 1600)` and WebP quality `0.82`;
     when off, no downscale (output = crop size) and WebP quality `0.95` (near-lossless,
     full resolution). Draw scaled into the output canvas.
  4. If `round`, `ctx.globalCompositeOperation = "destination-in"` + `arc` fill (or
     clip before draw) so corners become transparent.
  5. `canvas.toBlob(blob => …, "image/webp", quality)`. If the blob is null
     (unsupported), retry with `"image/jpeg"` at the same quality.
  6. Wrap the blob in a `File` named `<stem>.webp` (`.jpg` on the fallback), type set
     accordingly; return it.
- Canvas draw is verified manually (jsdom has no real canvas); only `fitWithin` has
  an automated test.

## §4 — Dependency

Add `react-easy-crop` to `apps/web/package.json` (client-only; check current
version at install). No `sharp`, no server-side image lib.

## Out of scope / ponytail

- Destructive bake — no re-editable original / stored `ImageDetails` (that's the
  server-transform path, deliberately skipped).
- Aspect-ratio picker beyond square/free — keep a square default with free pan/zoom;
  add ratio presets later if asked.
- Background-color fill for rotation gaps (nocode-saas has it) — with WebP alpha we
  leave rotation corners transparent instead of filling; simpler and looks clean.

## Testing

- `fitWithin`: `(2000,1000,1600) → (1600,800)`; `(800,600,1600) → (800,600)`;
  square clamp `(3000,3000,1600) → (1600,1600)`.
- Manual E2E: upload a wide photo → crop square → rotate 90° → flip → toggle round →
  Apply → the stored file is WebP, renders in the dialog preview + table thumbnail,
  and is smaller than the source.

## Success criteria

- Selecting an image opens the cropper; Apply uploads an optimized WebP; Cancel
  aborts cleanly (diceui state cleared, object URL revoked).
- Crop, rotation, flips, and circle are all reflected in the baked output.
- Output is WebP (JPEG fallback only when WebP encode is unavailable), longest side
  ≤ 1600 px, and typically smaller than the original.
- No server route/storage change; `pnpm --filter web typecheck` passes.
