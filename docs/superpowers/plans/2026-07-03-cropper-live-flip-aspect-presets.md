# Cropper Upgrade (live flip, aspect presets, free crop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the image cropper live flip preview, aspect presets (1:1/16:9/4:3/3:2/9:16), a free ratio, a free-form crop, and a circle stencil — by swapping `react-easy-crop` for `react-advanced-cropper` and exporting via its `getCanvas()`.

**Architecture:** `react-advanced-cropper` applies crop/rotation/flips (live) and returns the final canvas via `getCanvas({maxWidth,maxHeight})`; a new `encodeCanvasToFile()` encodes that canvas to an optimized WebP. `ImageCropperDialog` is rewritten; `ImageUploader`, the upload route, storage, and `dishes.image` are untouched.

**Tech Stack:** React 19.2.4, `react-advanced-cropper`, shadcn `Dialog`/`Button`/`Slider`/`Switch`, Canvas `toBlob`, Next.js.

## Global Constraints

- Swap the cropper: remove `react-easy-crop` (no other consumer), add `react-advanced-cropper` (+ `import "react-advanced-cropper/dist/style.css"` in the dialog client module).
- Aspect presets in the dialog: **Free** (no aspectRatio), **1:1**, **16:9** (16/9), **4:3** (4/3), **3:2** (3/2), **9:16** (9/16), **Circle** (CircleStencil, 1:1). Active preset highlighted.
- Flip via `cropperRef.current.flip(true,false)` / `flip(false,true)` — live in the viewfinder. Rotate via `cropperRef.current.rotate(delta)` (relative). Apply via `cropperRef.current.getCanvas(drawOptions)`.
- Optimize toggle (default ON): ON → `getCanvas({ maxWidth:1600, maxHeight:1600, imageSmoothingQuality:"high" })` + WebP q0.82; OFF → `getCanvas({})` + WebP q0.95. JPEG fallback when WebP `toBlob` returns null. Output `File` named `<stem>.webp` (`.jpg` on fallback).
- `ImageCropperDialog` keeps the same props `{ open, src, fileName?, onCancel, onApply }` and the inline-error + busy behavior.
- `export-image.ts`: replace the manual-geometry `exportImage`/`fitWithin`/`loadImage`/`ExportOptions`/`CropPixels` with a single `encodeCanvasToFile(canvas, { optimize?, fileName? })`. Delete `export-image.test.ts` (only covered `fitWithin`).
- No route/schema/storage change. No `Co-Authored-By` trailer. Don't touch unrelated files.
- No automated unit test (canvas needs a real browser) — verified by manual E2E in Task 2.

## File Structure

**Modify:**
- `apps/web/package.json` — deps: `-react-easy-crop`, `+react-advanced-cropper`.
- `apps/web/lib/images/export-image.ts` — replace exports with `encodeCanvasToFile`.
- `apps/web/components/files/image-cropper-dialog.tsx` — rewrite on `react-advanced-cropper`.

**Delete:**
- `apps/web/lib/images/export-image.test.ts` (fitWithin test — the tested code is removed).

---

### Task 1: Add `react-advanced-cropper` + `encodeCanvasToFile` (additive)

This task is additive so the tree stays typecheck-green: the old `react-easy-crop` dialog and `exportImage` keep working until Task 2 swaps them.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/images/export-image.ts`

**Interfaces:**
- Produces: `encodeCanvasToFile(canvas: HTMLCanvasElement, opts?: { optimize?: boolean; fileName?: string }): Promise<File>`.

- [ ] **Step 1: Add the dependency**

Run (from `apps/web`): `pnpm add react-advanced-cropper`
Expected: adds `react-advanced-cropper` to `apps/web/package.json` dependencies and updates the lockfile. Note the installed version.
Do NOT remove `react-easy-crop` yet (Task 2 removes it once the dialog stops importing it).

- [ ] **Step 2: Add `encodeCanvasToFile` to `export-image.ts`**

Append to `apps/web/lib/images/export-image.ts` (keep the existing `exportImage`/`fitWithin` for now — Task 2 removes them):
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
Note: `export-image.ts` already has an `encode(...)` helper used by `exportImage`; use the distinct name `encodeCanvas` here to avoid a redeclaration (Task 2 deletes the old one along with `exportImage`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (additive change; existing dialog/exportImage untouched).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/lib/images/export-image.ts
git commit -m "feat(images): add react-advanced-cropper dep and encodeCanvasToFile"
```

---

### Task 2: Rewrite `ImageCropperDialog`; drop react-easy-crop + old export

**Files:**
- Modify: `apps/web/components/files/image-cropper-dialog.tsx` (full rewrite)
- Modify: `apps/web/lib/images/export-image.ts` (remove old exports)
- Modify: `apps/web/package.json` (remove `react-easy-crop`)
- Delete: `apps/web/lib/images/export-image.test.ts`

**Interfaces:**
- Consumes: `encodeCanvasToFile` from `@/lib/images/export-image`; `Cropper`/`CropperRef`/`RectangleStencil`/`CircleStencil` from `react-advanced-cropper`.
- Produces: `ImageCropperDialog({ open, src, fileName?, onCancel, onApply })` unchanged signature.

- [ ] **Step 1: Rewrite the dialog on react-advanced-cropper**

Replace the entire contents of `apps/web/components/files/image-cropper-dialog.tsx` with:
```tsx
"use client";

import { useRef, useState } from "react";
import { CircleStencil, Cropper, type CropperRef, RectangleStencil } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import { FlipHorizontalIcon, FlipVerticalIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { encodeCanvasToFile } from "@/lib/images/export-image";

type Preset = { label: string; aspect?: number; round?: boolean };
const PRESETS: Preset[] = [
  { label: "Free" },
  { label: "1:1", aspect: 1 },
  { label: "16:9", aspect: 16 / 9 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "9:16", aspect: 9 / 16 },
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
  const cropperRef = useRef<CropperRef>(null);
  const [presetIdx, setPresetIdx] = useState(1); // default 1:1
  const [rotation, setRotation] = useState(0);
  const [optimize, setOptimize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS[presetIdx] ?? PRESETS[0]!;
  const round = Boolean(preset.round);

  function rotateTo(next: number) {
    cropperRef.current?.rotate(next - rotation);
    setRotation(next);
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const canvas = cropperRef.current?.getCanvas(
        optimize ? { maxWidth: 1600, maxHeight: 1600, imageSmoothingQuality: "high" } : {},
      );
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

        <div className="bg-muted overflow-hidden rounded-md">
          <Cropper
            ref={cropperRef}
            src={src}
            stencilComponent={round ? CircleStencil : RectangleStencil}
            stencilProps={preset.aspect ? { aspectRatio: preset.aspect } : {}}
            className="h-64 w-full"
          />
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={i === presetIdx ? "default" : "outline"}
                onClick={() => setPresetIdx(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Rotation</Label>
            <Slider min={0} max={360} step={1} value={[rotation]} onValueChange={(v) => rotateTo(v[0] ?? 0)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => rotateTo((rotation + 90) % 360)}>
              <RotateCwIcon className="size-4" /> 90°
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.flip(true, false)}>
              <FlipHorizontalIcon className="size-4" /> Flip H
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => cropperRef.current?.flip(false, true)}>
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
          <Button type="button" onClick={apply} disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null} Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
If `react-advanced-cropper`'s installed API differs (e.g. `flip`/`rotate`/`getCanvas` names or `stencilProps.aspectRatio`), confirm against `node_modules/react-advanced-cropper` types and adapt, recording the deviation in your report. `lucide-react` flip-icon names may differ (`FlipHorizontal2Icon` etc.) — use what the installed lucide exports.

- [ ] **Step 2: Remove the old geometry exports from `export-image.ts`**

Edit `apps/web/lib/images/export-image.ts`: delete `exportImage`, `fitWithin`, `loadImage`, the `encode` helper (the old one used by `exportImage`), `toRad`, and the `ExportOptions`/`CropPixels` interfaces. Keep ONLY `encodeCanvas` + `encodeCanvasToFile` (added in Task 1). The file should end up as just those two functions.

- [ ] **Step 3: Delete the obsolete test**

```bash
git rm apps/web/lib/images/export-image.test.ts
```
(It only tested `fitWithin`, which no longer exists.)

- [ ] **Step 4: Remove `react-easy-crop`**

Run (from `apps/web`): `pnpm remove react-easy-crop`
Expected: drops it from `apps/web/package.json` + lockfile. (Nothing imports it anymore — Step 1 replaced the only consumer.)

- [ ] **Step 5: Confirm no stale references**

Run: `rg -n "react-easy-crop|exportImage|fitWithin" apps/web --glob '!*.next*'`
Expected: NO matches. Fix any that remain.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Manual end-to-end (real browser — the only runtime check)**

Start dev: `DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' pnpm --filter web dev`
Sign in as admin → `/dashboard/catalog/dishes` → edit a dish → Choose image → in the cropper:
- Click **Flip H**, then **Flip V** — the preview image must mirror immediately (the reported bug).
- Click **16:9** — crop box becomes widescreen; click **Free** — drag an arbitrary rectangle; click **Circle** — round stencil.
- Drag the **Rotation** slider and click **90°** — image rotates live.
- Leave **Optimize** on → **Apply**. Confirm upload succeeds, preview + table thumbnail render, and the stored file is WebP:
```bash
cd apps/web && DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' node --input-type=module -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const r=await sql\`select name, image from dishes where image is not null order by updated_at desc limit 1\`; console.log(JSON.stringify(r[0],null,2)); await sql.end();"
```
Expected: newest `image.url` ends `.webp`. Repeat once with a **Free** crop and **Optimize OFF**.
(If you cannot drive a browser, do the static checks — typecheck, rg-clean — and report that the manual E2E was NOT run so the controller/user runs it.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/files/image-cropper-dialog.tsx apps/web/lib/images/export-image.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(files): cropper live flip + aspect presets + free/circle crop (react-advanced-cropper)"
```

---

## Self-Review

**Spec coverage:**
- §1 library swap (remove react-easy-crop, add react-advanced-cropper + CSS) → Task 1 (add) + Task 2 Steps 1,4. ✓
- §2 dialog rewrite (presets Free/1:1/16:9/4:3/3:2/9:16/Circle, live flip, rotate, optimize) → Task 2 Step 1. ✓
- §3 export via getCanvas + `encodeCanvasToFile`; remove old geometry + test → Task 1 Step 2 (add helper) + Task 2 Steps 2,3. ✓
- §4 unchanged (uploader/route/storage/thumbnail) → untouched. ✓
- No-unit-test / E2E → Task 2 Step 7. ✓

**Placeholder scan:** No TBD/TODO. Third-party uncertainties (react-advanced-cropper method/prop names; lucide flip-icon names) carry explicit confirm-and-adapt instructions.

**Type consistency:** `encodeCanvasToFile(canvas, { optimize?, fileName? })` defined in Task 1, consumed in Task 2's dialog. `ImageCropperDialog` props `{ open, src, fileName?, onCancel, onApply }` unchanged (ImageUploader already calls it that way — not modified). `getCanvas` draw options object matches react-advanced-cropper's `DrawOptions` (maxWidth/maxHeight/imageSmoothingQuality). `encodeCanvas` (new) vs the old `encode` (removed in Task 2) — distinct names, no clash during Task 1's additive phase.

## Success Criteria

- Flip H/V update the cropper preview live.
- Aspect presets + Free + Circle all select and reflect in the crop box; free-form crop works.
- Apply produces an optimized WebP via `getCanvas` → `encodeCanvasToFile`; upload/render/DB unchanged.
- `react-easy-crop`, `exportImage`, `fitWithin` all gone; `pnpm --filter web typecheck` passes.
