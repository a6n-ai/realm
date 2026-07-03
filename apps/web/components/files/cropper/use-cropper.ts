"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitWithin } from "@/lib/images/export-image";
import {
  type Handle,
  type Rect,
  type Size,
  clampBox,
  exportRect,
  fitBox,
  orientedSize,
  resizeBox,
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
    setCrop((c) => applyAspectToExisting(c, opts.aspect, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.aspect, opts.round]);

  const rotate = useCallback(
    (dir: 1 | -1) => {
      const rot = (((orientation.rot + dir * 90) % 360) + 360) % 360 as Orientation["rot"];
      const next: Orientation = { ...orientation, rot };
      setOrientation(next);
      rebuild(next);
    },
    [orientation, rebuild],
  );

  const flip = useCallback(
    (axis: "h" | "v") => {
      const next: Orientation = axis === "h" ? { ...orientation, flipH: !orientation.flipH } : { ...orientation, flipV: !orientation.flipV };
      setOrientation(next);
      rebuild(next);
    },
    [orientation, rebuild],
  );

  const setZoom = useCallback((z: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const zoom = Math.max(0.05, z);
    setView((v) => {
      // zoom about viewport center
      const cx = vp.clientWidth / 2;
      const cy = vp.clientHeight / 2;
      const imgX = (cx - v.panX) / v.zoom;
      const imgY = (cy - v.panY) / v.zoom;
      return { zoom, panX: cx - imgX * zoom, panY: cy - imgY * zoom };
    });
  }, []);

  const onImagePointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
    },
    [view.panX, view.panY],
  );

  const onBoxPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      gesture.current = { kind: "move", startX: e.clientX, startY: e.clientY, crop };
    },
    [crop],
  );

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      gesture.current = { kind: "resize", handle, startX: e.clientX, startY: e.clientY, crop };
    },
    [crop],
  );

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
