"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CornerDownRightIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveSource, saveSubsource, setSourceActive, setSubsourceActive } from "./actions";

type Sub = { publicId: string; key: string; label: string; active: boolean };
type Source = {
  publicId: string;
  key: string;
  label: string;
  isInbound: boolean;
  active: boolean;
  subs: Sub[];
};

// A monospace chip for the raw key — visible but de-emphasised, so the human
// label leads and the key is reference, not noise.
function KeyChip({ value }: { value: string }) {
  return (
    <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-xs">
      {value}
    </span>
  );
}

type DialogState =
  | { kind: "source"; mode: "create" | "edit"; publicId: string | null; key: string; label: string; isInbound: boolean }
  | { kind: "subsource"; mode: "create" | "edit"; publicId: string | null; sourcePublicId: string; sourceLabel: string; key: string; label: string };

export function LeadSourcesManager({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  function run(fn: () => Promise<void>, ok: string) {
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setDialog(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function submit() {
    if (!dialog) return;
    if (dialog.kind === "source") {
      if (!dialog.key.trim() || !dialog.label.trim()) return toast.error("Key and label are required");
      run(
        () => saveSource(dialog.publicId, { key: dialog.key.trim(), label: dialog.label.trim(), isInbound: dialog.isInbound }),
        dialog.mode === "create" ? "Source added" : "Source updated",
      );
    } else {
      if (!dialog.key.trim() || !dialog.label.trim()) return toast.error("Key and label are required");
      run(
        () => saveSubsource(dialog.publicId, { sourcePublicId: dialog.sourcePublicId, key: dialog.key.trim(), label: dialog.label.trim() }),
        dialog.mode === "create" ? "Sub-source added" : "Sub-source updated",
      );
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </p>
        <Button
          size="sm"
          className="active:scale-[0.96] transition-transform"
          onClick={() =>
            setDialog({ kind: "source", mode: "create", publicId: null, key: "", label: "", isInbound: true })
          }
        >
          <PlusIcon className="size-4" />
          Add source
        </Button>
      </div>

      {sources.map((s, i) => (
        <div
          key={s.publicId}
          className={cn(
            "bg-card rounded-xl border p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500",
            !s.active && "opacity-60",
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-pretty font-semibold">{s.label}</span>
                <KeyChip value={s.key} />
                {s.isInbound ? (
                  <Badge variant="secondary">Inbound</Badge>
                ) : (
                  <Badge variant="outline">Outbound</Badge>
                )}
                {!s.active && <Badge variant="destructive">Retired</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="active:scale-[0.96] transition-transform"
                onClick={() =>
                  setDialog({ kind: "source", mode: "edit", publicId: s.publicId, key: s.key, label: s.label, isInbound: s.isInbound })
                }
              >
                <PencilIcon className="size-3.5" />
                Edit
              </Button>
              {s.active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground active:scale-[0.96] transition-[color,transform]"
                  disabled={pending}
                  onClick={() => run(() => setSourceActive(s.publicId, false), "Source retired")}
                >
                  <XIcon className="size-3.5" />
                  Retire
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="active:scale-[0.96] transition-transform"
                  disabled={pending}
                  onClick={() => run(() => setSourceActive(s.publicId, true), "Source reactivated")}
                >
                  <RotateCcwIcon className="size-3.5" />
                  Reactivate
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-1.5">
            {s.subs.length === 0 ? (
              <p className="text-muted-foreground pl-6 text-sm">No sub-sources yet.</p>
            ) : (
              s.subs.map((ss) => (
                <div
                  key={ss.publicId}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                    !ss.active && "opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CornerDownRightIcon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="text-sm font-medium">{ss.label}</span>
                    <KeyChip value={ss.key} />
                    {!ss.active && <Badge variant="destructive">Retired</Badge>}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="active:scale-[0.96] transition-transform"
                      onClick={() =>
                        setDialog({ kind: "subsource", mode: "edit", publicId: ss.publicId, sourcePublicId: s.publicId, sourceLabel: s.label, key: ss.key, label: ss.label })
                      }
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    {ss.active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground active:scale-[0.96] transition-[color,transform]"
                        disabled={pending}
                        onClick={() => run(() => setSubsourceActive(ss.publicId, false), "Sub-source retired")}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="active:scale-[0.96] transition-transform"
                        disabled={pending}
                        onClick={() => run(() => setSubsourceActive(ss.publicId, true), "Sub-source reactivated")}
                      >
                        <RotateCcwIcon className="size-3.5" />
                      </Button>
                    )}
                  </span>
                </div>
              ))
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground active:scale-[0.96] mt-0.5 justify-self-start transition-[color,transform]"
              onClick={() =>
                setDialog({ kind: "subsource", mode: "create", publicId: null, sourcePublicId: s.publicId, sourceLabel: s.label, key: "", label: "" })
              }
            >
              <PlusIcon className="size-3.5" />
              Add sub-source
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle className="text-pretty">
                  {dialog.mode === "create" ? "Add" : "Edit"} {dialog.kind === "source" ? "source" : "sub-source"}
                </DialogTitle>
                <DialogDescription>
                  {dialog.kind === "subsource"
                    ? `Under ${dialog.sourceLabel}.`
                    : "A top-level place leads come from."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-1">
                <div className="grid gap-1.5">
                  <Label htmlFor="ls-label">Label</Label>
                  <Input
                    id="ls-label"
                    autoFocus
                    placeholder={dialog.kind === "source" ? "e.g. Facebook" : "e.g. Facebook Ads"}
                    value={dialog.label}
                    onChange={(e) => setDialog({ ...dialog, label: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ls-key">Key</Label>
                  <Input
                    id="ls-key"
                    className="font-mono"
                    placeholder={dialog.kind === "source" ? "facebook" : "fb_ads"}
                    value={dialog.key}
                    onChange={(e) => setDialog({ ...dialog, key: e.target.value })}
                  />
                  <p className="text-muted-foreground text-xs">Stable identifier used in code and reports. Avoid changing once leads exist.</p>
                </div>
                {dialog.kind === "source" && (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="grid gap-0.5">
                      <Label htmlFor="ls-inbound">Inbound</Label>
                      <p className="text-muted-foreground text-xs">Auto-assign new leads from this source.</p>
                    </div>
                    <Switch
                      id="ls-inbound"
                      checked={dialog.isInbound}
                      onCheckedChange={(v) => setDialog({ ...dialog, isInbound: v })}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={pending} className="active:scale-[0.96] transition-transform">
                  {dialog.mode === "create" ? "Add" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

LeadSourcesManager.Skeleton = function LeadSourcesManagerSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>

          <div className="mt-3 grid gap-1.5">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <CornerDownRightIcon className="text-muted-foreground size-3.5 shrink-0" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-14 rounded-md" />
                </span>
                <span className="flex items-center gap-1">
                  <Skeleton className="size-8" />
                  <Skeleton className="size-8" />
                </span>
              </div>
            ))}
            <Skeleton className="mt-0.5 h-8 w-32 justify-self-start" />
          </div>
        </div>
      ))}
    </div>
  );
};
