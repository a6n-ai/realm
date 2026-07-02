# Image Transforms + Optimization at Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable `<ImageUploader edit>` in `apps/web/components/files/` that lets staff crop / rotate / flip / circle-crop an image and optimize it (downscale + WebP) in the browser before uploading, with a simple direct-upload mode when `edit={false}`.

**Architecture:** Client-side bake. On select, `ImageUploader` (edit mode) opens `ImageCropperDialog` (`react-easy-crop`); on Apply, a canvas `exportImage()` bakes crop+rotation+flips+circle and encodes WebP via `canvas.toBlob`, then uploads through the existing `POST /api/files/upload`. No `sharp`, no server transform route, no schema change.

**Tech Stack:** React 19.2.4, `react-easy-crop`, shadcn `Dialog`/`Button`/`Slider`/`Switch`, diceui `FileUpload` dropzone (already vendored), Canvas API, vitest (jsdom).

## Global Constraints

- Reusable component home: `apps/web/components/files/`. One component `ImageUploader` with an `edit?: boolean` prop (default `true`). NOT a new package.
- `FileDetail` imported ONLY from `@tiffin/commons-files/model` (never the root barrel — keeps aws-sdk out of the client bundle).
- Transforms: crop, rotate (any angle), circle crop, flip H/V. **Flips are applied at export only** (baked into the output) — not live-previewed in v1; document this.
- Optimize toggle (default ON): ON → downscale longest side ≤ **1600 px**, WebP quality **0.82**; OFF → no downscale, WebP quality **0.95**. WebP encode via `canvas.toBlob(_, "image/webp", q)`; JPEG fallback only when WebP returns null.
- Upload transport unchanged: `POST /api/files/upload` (staff-only), multipart `file` (+ `prefix`), ≤5 MB, allowed MIME incl. `image/webp`. No auth/route/storage/schema change.
- Uploader stays staff-only (used in the admin catalog editor). No customer-facing upload in this plan.
- No `Co-Authored-By` trailer in commits. Do not touch unrelated files.

## File Structure

**Create:**
- `apps/web/lib/images/export-image.ts` (+ `.test.ts`) — `fitWithin`, `exportImage`.
- `apps/web/components/files/image-cropper-dialog.tsx` — cropper dialog.
- `apps/web/components/files/image-uploader.tsx` (+ `__tests__/image-uploader.test.tsx`) — reusable uploader.
- `apps/web/components/files/index.ts` — barrel.
- `apps/web/components/ui/slider.tsx` — shadcn slider (via CLI).

**Modify:**
- `apps/web/package.json` — add `react-easy-crop`.
- `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx` — import `ImageUploader` from `@/components/files` (replaces `ImageUploadField`).

**Delete (after migration):**
- `apps/web/components/ds/image-upload-field.tsx`
- `apps/web/components/ds/__tests__/image-upload-field.test.tsx`
- the `ImageUploadField` export line in `apps/web/components/ds/index.ts`

---

### Task 1: `export-image.ts` — `fitWithin` + `exportImage`

**Files:**
- Create: `apps/web/lib/images/export-image.ts`
- Test: `apps/web/lib/images/export-image.test.ts`

**Interfaces:**
- Produces:
  - `interface CropPixels { x: number; y: number; width: number; height: number }`
  - `interface ExportOptions { cropPixels: CropPixels; rotation?: number; flipH?: boolean; flipV?: boolean; round?: boolean; optimize?: boolean; fileName?: string }`
  - `function fitWithin(w: number, h: number, maxDim: number): { w: number; h: number }`
  - `function exportImage(src: string, opts: ExportOptions): Promise<File>`

- [ ] **Step 1: Write the failing test for `fitWithin`**

`apps/web/lib/images/export-image.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { fitWithin } from "./export-image";

describe("fitWithin", () => {
  it("downscales the longest side to maxDim, preserving aspect", () => {
    expect(fitWithin(2000, 1000, 1600)).toEqual({ w: 1600, h: 800 });
  });
  it("leaves images already within bounds untouched", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });
  it("clamps a square to maxDim x maxDim", () => {
    expect(fitWithin(3000, 3000, 1600)).toEqual({ w: 1600, h: 1600 });
  });
  it("rounds fractional results", () => {
    expect(fitWithin(1000, 333, 500)).toEqual({ w: 500, h: 167 });
  });
});
```

- [ ] **Step 2: Run it (fails — no module)**

Run: `pnpm --filter web test export-image`
Expected: FAIL — cannot resolve `./export-image`.

- [ ] **Step 3: Implement `export-image.ts`**

`apps/web/lib/images/export-image.ts`:
```ts
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
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter web test export-image`
Expected: PASS (4 `fitWithin` assertions). (`exportImage` needs a real canvas — not unit-tested here; verified manually in Task 4.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.
```bash
git add apps/web/lib/images/export-image.ts apps/web/lib/images/export-image.test.ts
git commit -m "feat(images): canvas exportImage (crop/rotate/flip/circle + webp optimize) + fitWithin"
```

---

### Task 2: Dependency + slider + `ImageCropperDialog`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/components/ui/slider.tsx` (via CLI)
- Create: `apps/web/components/files/image-cropper-dialog.tsx`

**Interfaces:**
- Consumes: `exportImage`, `ExportOptions` from `@/lib/images/export-image`; `react-easy-crop` `Cropper` + `Area`.
- Produces: `ImageCropperDialog({ open: boolean; src: string; fileName?: string; onCancel: () => void; onApply: (file: File) => void })`.

- [ ] **Step 1: Add react-easy-crop**

Edit `apps/web/package.json` dependencies, add:
```json
"react-easy-crop": "^5.5.0",
```
Run: `pnpm install`
Expected: installs; workspace intact.

- [ ] **Step 2: Add the shadcn slider**

Run (from `apps/web`): `pnpm dlx shadcn@latest add slider`
Expected: creates `apps/web/components/ui/slider.tsx`. If it prompts to overwrite anything else, decline. If the CLI 404s, STOP and report BLOCKED with output (do not hand-fabricate).

- [ ] **Step 3: Write the cropper dialog**

`apps/web/components/files/image-cropper-dialog.tsx`:
```tsx
"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { FlipHorizontalIcon, FlipVerticalIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { exportImage } from "@/lib/images/export-image";

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
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [round, setRound] = useState(false);
  const [optimize, setOptimize] = useState(true);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, px: Area) => setArea(px), []);

  async function apply() {
    if (!area) return;
    setBusy(true);
    try {
      const file = await exportImage(src, {
        cropPixels: area,
        rotation,
        flipH,
        flipV,
        round,
        optimize,
        fileName,
      });
      onApply(file);
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

        <div className="bg-muted relative h-64 w-full overflow-hidden rounded-md">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape={round ? "round" : "rect"}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Zoom</Label>
            <Slider min={1} max={3} step={0.01} value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 1)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Rotation</Label>
            <Slider min={0} max={360} step={1} value={[rotation]} onValueChange={(v) => setRotation(v[0] ?? 0)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCwIcon className="size-4" /> 90°
            </Button>
            <Button type="button" variant={flipH ? "default" : "outline"} size="sm" onClick={() => setFlipH((v) => !v)}>
              <FlipHorizontalIcon className="size-4" /> Flip H
            </Button>
            <Button type="button" variant={flipV ? "default" : "outline"} size="sm" onClick={() => setFlipV((v) => !v)}>
              <FlipVerticalIcon className="size-4" /> Flip V
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch checked={round} onCheckedChange={setRound} /> Circle
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={optimize} onCheckedChange={setOptimize} /> Optimize for web (WebP)
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={busy || !area}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null} Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
Note: flips are baked at export only (passed to `exportImage`), not shown live in the cropper preview — acceptable for v1; the flip buttons show pressed state. If `react-easy-crop`'s `Cropper` is a default export vs named in the installed version, adjust the import and record it. If `lucide-react` lacks `FlipHorizontalIcon`/`FlipVerticalIcon`, use `FlipHorizontal2Icon`/`FlipVertical2Icon` or the non-`Icon` suffix per the installed version.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.
```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components/ui/slider.tsx apps/web/components/files/image-cropper-dialog.tsx
git commit -m "feat(files): image cropper dialog (react-easy-crop + rotate/flip/circle/optimize)"
```

---

### Task 3: `ImageUploader` (reusable, edit/simple) + barrel

**Files:**
- Create: `apps/web/components/files/image-uploader.tsx`
- Create: `apps/web/components/files/__tests__/image-uploader.test.tsx`
- Create: `apps/web/components/files/index.ts`

**Interfaces:**
- Consumes: `ImageCropperDialog` from `./image-cropper-dialog`; diceui `FileUpload`/`FileUploadDropzone`/`FileUploadTrigger` from `@/components/ui/file-upload`; `FileDetail` from `@tiffin/commons-files/model`.
- Produces: `ImageUploader({ value: FileDetail | null; onChange: (v: FileDetail | null) => void; edit?: boolean; prefix?: string; disabled?: boolean; shape?: "square" | "round" })`. Barrel `@/components/files` re-exports `ImageUploader`.

- [ ] **Step 1: Write the failing component test**

`apps/web/components/files/__tests__/image-uploader.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageUploader } from "../image-uploader";

const detail = {
  name: "a.webp",
  fileName: "a",
  type: "webp",
  isDirectory: false,
  size: 3,
  filePath: "x/a.webp",
  url: "/api/files/x/a.webp",
};

describe("ImageUploader", () => {
  it("shows a preview image when a value is set", () => {
    render(<ImageUploader value={detail} onChange={() => {}} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/files/x/a.webp");
  });

  it("renders a round preview when shape=round", () => {
    render(<ImageUploader value={detail} onChange={() => {}} shape="round" />);
    expect(screen.getByRole("img").className).toContain("rounded-full");
  });

  it("renders the dropzone (no image) when value is null", () => {
    render(<ImageUploader value={null} onChange={() => {}} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails — no module)**

Run: `pnpm --filter web test image-uploader`
Expected: FAIL — cannot resolve `../image-uploader`.

- [ ] **Step 3: Implement `ImageUploader`**

`apps/web/components/files/image-uploader.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { FileDetail } from "@tiffin/commons-files/model";
import { Button } from "@/components/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";
import { ImageCropperDialog } from "./image-cropper-dialog";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

type DiceOptions = {
  onSuccess: (file: File) => void;
  onError: (file: File, error: Error) => void;
};

export function ImageUploader({
  value,
  onChange,
  edit = true,
  prefix,
  disabled,
  shape = "square",
}: {
  value: FileDetail | null;
  onChange: (v: FileDetail | null) => void;
  edit?: boolean;
  prefix?: string;
  disabled?: boolean;
  shape?: "square" | "round";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState("image");
  const pending = useRef<DiceOptions | null>(null);

  async function upload(file: File, options: DiceOptions) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      const e = new Error("Only PNG, JPEG, WebP or GIF images are allowed");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    if (file.size > MAX_BYTES) {
      const e = new Error("Image must be 5 MB or smaller");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (prefix) body.set("prefix", prefix);
      const res = await fetch("/api/files/upload", { method: "POST", body });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Upload failed");
      }
      onChange((await res.json()) as FileDetail);
      options.onSuccess(file);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Upload failed");
      setError(err.message);
      options.onError(file, err);
    } finally {
      setBusy(false);
    }
  }

  function onSelected(file: File, options: DiceOptions) {
    if (!edit) {
      void upload(file, options);
      return;
    }
    // Pre-validate type before opening the editor (size is re-checked on upload).
    if (!ACCEPT.includes(file.type)) {
      const e = new Error("Only PNG, JPEG, WebP or GIF images are allowed");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    pending.current = options;
    setCropName(file.name.replace(/\.[^.]+$/, "") || "image");
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    pending.current = null;
  }

  async function onCropApply(file: File) {
    const options = pending.current;
    closeCropper();
    if (options) await upload(file, options);
  }

  function onCropCancel() {
    // Clear diceui's pending file state so the dropzone resets.
    pending.current?.onError(new File([], cropName), new Error("cancelled"));
    closeCropper();
  }

  if (value?.url) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.url}
          alt={value.fileName ?? "image"}
          className={cn("size-16 border object-cover", shape === "round" ? "rounded-full" : "rounded-md")}
        />
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
          <XIcon className="size-4" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <FileUpload
        accept={ACCEPT.join(",")}
        maxSize={MAX_BYTES}
        disabled={disabled || busy}
        multiple={false}
        onUpload={async (files, options) => {
          const file = files[0];
          if (file) onSelected(file, options);
        }}
      >
        <FileUploadDropzone className={cn("border-dashed", busy && "opacity-60")}>
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-sm">
            {busy ? <Loader2Icon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
            <span>{busy ? "Uploading…" : edit ? "Drop an image to edit & upload" : "Drop an image or click to upload"}</span>
          </div>
          <FileUploadTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy}>
              Choose image
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {cropSrc ? (
        <ImageCropperDialog open src={cropSrc} fileName={cropName} onCancel={onCropCancel} onApply={onCropApply} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the barrel**

`apps/web/components/files/index.ts`:
```ts
export { ImageUploader } from "./image-uploader";
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter web test image-uploader`
Expected: PASS (3 tests).
Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/files
git commit -m "feat(files): reusable ImageUploader (edit crops/optimizes, edit=false simple upload)"
```

---

### Task 4: Migrate catalog editor + remove old field

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx`
- Delete: `apps/web/components/ds/image-upload-field.tsx`
- Delete: `apps/web/components/ds/__tests__/image-upload-field.test.tsx`
- Modify: `apps/web/components/ds/index.ts`

**Interfaces:**
- Consumes: `ImageUploader` from `@/components/files`.

- [ ] **Step 1: Point the editor at `ImageUploader`**

In `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx`:
Change the import (line ~16):
```ts
import { ImageUploadField } from "@/components/ds/image-upload-field";
```
to:
```ts
import { ImageUploader } from "@/components/files";
```
Change the JSX usage (the `f.type === "image"` branch, ~line 113) from `<ImageUploadField … />` to `<ImageUploader … />`, keeping the same props (`value`, `onChange`, `prefix="catalog/dishes"`). `edit` defaults to `true`, so the dishes editor now gets the crop dialog. Full branch after edit:
```tsx
          ) : f.type === "image" ? (
            <FormControl>
              <ImageUploader
                value={(field.value as FileDetail | null) ?? null}
                onChange={field.onChange}
                prefix="catalog/dishes"
              />
            </FormControl>
```
(`FileDetail` is already imported in this file from `@tiffin/commons-files/model`; keep that import.)

- [ ] **Step 2: Remove the old field + its export + its test**

Delete the files:
```bash
git rm apps/web/components/ds/image-upload-field.tsx "apps/web/components/ds/__tests__/image-upload-field.test.tsx"
```
In `apps/web/components/ds/index.ts`, remove the line:
```ts
export { ImageUploadField } from "./image-upload-field";
```

- [ ] **Step 3: Confirm nothing else references the old field**

Run: `rg -n "ImageUploadField|image-upload-field" apps/web --glob '!*.next*'`
Expected: NO matches. If any remain, update them to `ImageUploader` from `@/components/files`.

- [ ] **Step 4: Typecheck + full web test**

Run: `pnpm --filter web typecheck`
Expected: PASS.
Run: `pnpm --filter web test image-uploader export-image`
Expected: PASS (uploader + fitWithin tests).

- [ ] **Step 5: Manual end-to-end (real canvas — the only exportImage check)**

Start dev: `DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' pnpm --filter web dev`
- Sign in as admin → `/dashboard/catalog/dishes` → add/edit a dish → Choose image (a wide JPEG).
- The cropper opens: zoom, rotate 90°, toggle Flip H, toggle Circle, leave Optimize ON → Apply.
- Confirm: upload succeeds, preview shows the cropped (circular) image, table thumbnail shows it, and the stored file is WebP:
```bash
cd apps/web && DATABASE_URL='postgres://lawbringr@localhost:5432/tiffin' node --input-type=module -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const r=await sql\`select name, image from dishes where image is not null order by updated_at desc limit 1\`; console.log(JSON.stringify(r,null,2)); await sql.end();"
```
Expected: `image.url` ends in `.webp` under `/api/files/catalog-dishes/…`, opening it renders the edited image, and the file is smaller than the source. Repeat once with Optimize OFF and confirm a larger, full-resolution WebP.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx" apps/web/components/ds/index.ts
git commit -m "feat(catalog): use ImageUploader (crop/optimize) for dish images; remove old ImageUploadField"
```

---

## Self-Review

**Spec coverage:**
- §0 reusable `ImageUploader` in `components/files/` with `edit` prop, barrel, migration + old-field removal → Tasks 3, 4. ✓
- §1 edit-mode flow (intercept select → cropper → upload; cancel clears diceui + revokes URL) → Task 3 (`onSelected`/`onCropApply`/`onCropCancel`/`closeCropper`). ✓
- §2 cropper dialog (crop/zoom/rotate + 90°/flip/round/optimize toggle/apply-cancel; add slider) → Task 2. ✓
- §3 `exportImage` + `fitWithin`, optimize on/off (1600/0.82 vs no-downscale/0.95), circle clip, WebP + JPEG fallback → Task 1. ✓
- §4 dependency `react-easy-crop`, no sharp → Task 2. ✓
- Staff-only, no route/schema change → untouched (upload route reused as-is). ✓

**Placeholder scan:** No TBD/TODO. The third-party uncertainties (react-easy-crop default-vs-named export; lucide flip-icon name; shadcn slider CLI) carry explicit adapt/record or BLOCKED instructions — not silent gaps.

**Type consistency:** `ExportOptions`/`CropPixels`/`fitWithin`/`exportImage` defined in Task 1, consumed by `ImageCropperDialog` (Task 2). `ImageCropperDialog` prop shape `{ open, src, fileName?, onCancel, onApply }` defined Task 2, used verbatim in Task 3. `ImageUploader` prop shape `{ value, onChange, edit?, prefix?, disabled?, shape? }` defined Task 3, used in Task 4 with a subset (`value`/`onChange`/`prefix`). `FileDetail` from `@tiffin/commons-files/model` throughout. diceui `onUpload(files, options)` with `options: { onSuccess, onError }` matches the existing vendored component.

## Success Criteria

- In the dishes editor, choosing an image opens the cropper; crop/rotate/flip/circle + optimize toggle bake into an uploaded WebP that renders in the dialog preview and table thumbnail.
- `edit={false}` gives a simple direct upload (no dialog).
- Cancel clears the dropzone and revokes the object URL; no leaked blobs.
- `fitWithin` unit tests pass; `pnpm --filter web typecheck` passes; no `ImageUploadField` references remain; no route/schema change.
