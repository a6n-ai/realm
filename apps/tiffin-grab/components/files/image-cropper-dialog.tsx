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
