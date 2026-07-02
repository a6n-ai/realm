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
