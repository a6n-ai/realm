"use client";

/* eslint-disable react-hooks/refs --
 * `useCropper` returns one object bundling refs (orientedRef, viewportRef) with plain
 * state (view, crop, ready). The compiler treats the whole `api` object as ref-like, so
 * every read off it is reported — including `api.view.panX` and `api.ready`, which are
 * ordinary state. The refs here are only handed to `ref={}`, never dereferenced during
 * render, which is the thing the rule exists to prevent. Splitting the API into separate
 * ref props would not help: reading `api.viewportRef` to pass it along is flagged too.
 */

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
