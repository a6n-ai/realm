"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { localStore } from "@foundry/ui/safe-storage";
import { unwrapAction } from "@/lib/actions/unwrap";
import { NoSources } from "../../_leads/no-sources";
import { LAST_SOURCE_KEY, pillClass, readLastSource, type Src } from "../new-inquiry-form";
import { quickAddInquiries } from "../actions";
import { QUICK_ADD_MAX, parsePastedPhones } from "./parse-phones";

/** Rush mode: paste numbers now, name them later from the Quick adds tab. */
export function QuickAddDialog({ trigger, sources }: { trigger: React.ReactNode; sources: Src[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "");
  const [subSourceKey, setSubSourceKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = readLastSource();
    const src = sources.find((s) => s.key === saved.source);
    if (src) {
      setSourceKey(src.key);
      setSubSourceKey(src.subs.some((x) => x.key === saved.sub) ? saved.sub! : "");
    }
  }, [open, sources]);

  const { phones, tooMany } = parsePastedPhones(text);
  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setText("");
      setError(null);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await unwrapAction(quickAddInquiries({ text, sourceKey, subSourceKey: subSourceKey || undefined }));
      localStore.setJson(LAST_SOURCE_KEY, { source: sourceKey, sub: subSourceKey });
      const failedPart = res.failed.length ? `, ${res.failed.length} failed` : "";
      toast.success(`${res.added} added, ${res.folded} already open${failedPart}`, {
        description: res.failed.length ? res.failed.map((f) => `${f.phone}: ${f.error}`).join("\n") : undefined,
      });
      router.refresh();
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add leads");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick add numbers</DialogTitle>
          <DialogDescription>
            One number per line or comma-separated. Each becomes a numbered lead you can name later.
          </DialogDescription>
        </DialogHeader>
        {sources.length === 0 ? (
          <NoSources noun="inquiry" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Textarea
                autoFocus
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"647 555 1000\n416 555 2000"}
                aria-label="Phone numbers"
                aria-describedby="quick-add-count"
              />
              <p id="quick-add-count" className={tooMany ? "text-destructive text-xs" : "text-muted-foreground text-xs"} role="status">
                {tooMany ? `${phones.length} numbers - paste at most ${QUICK_ADD_MAX} at a time` : `${phones.length} ${phones.length === 1 ? "number" : "numbers"}`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium">Source</p>
              <div role="radiogroup" aria-label="Source" className="flex flex-wrap gap-2">
                {sources.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={sourceKey === s.key}
                    onClick={() => { setSourceKey(s.key); setSubSourceKey(""); }}
                    className={pillClass(sourceKey === s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {subs.length > 0 && (
                <div role="radiogroup" aria-label="Sub-source (optional)" className="flex flex-wrap gap-2">
                  {subs.map((sub) => (
                    <button
                      key={sub.key}
                      type="button"
                      role="radio"
                      aria-checked={subSourceKey === sub.key}
                      onClick={() => setSubSourceKey(subSourceKey === sub.key ? "" : sub.key)}
                      className={pillClass(subSourceKey === sub.key)}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || phones.length === 0 || tooMany || !sourceKey}>
            {busy && <Loader2Icon className="size-4 animate-spin" />}
            Add {phones.length || ""} {phones.length === 1 ? "lead" : "leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
