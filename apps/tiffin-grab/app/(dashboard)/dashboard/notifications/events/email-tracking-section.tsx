"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Switch } from "@foundry/ui/switch";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { trackedChanges } from "./event-names";

export interface EmailTypeRow {
  event: string;
  label: string;
  category: string;
  categoryLabel: string;
  tracked: boolean;
  locked: boolean;
}

const LOCKED_COPY = "Login and security emails stay untracked so they don't land in spam.";

export function EmailTrackingSection({
  types,
  onSave,
}: {
  types: EmailTypeRow[];
  onSave: (events: string[]) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => types.filter((t) => t.tracked).map((t) => t.event));
  const [draft, setDraft] = useState(saved);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const labels = new Map(types.map((t) => [t.event, t.label]));
  const changes = trackedChanges(saved, draft, (e) => labels.get(e) ?? e);
  const groups = new Map<string, EmailTypeRow[]>();
  for (const t of types) groups.set(t.categoryLabel, [...(groups.get(t.categoryLabel) ?? []), t]);

  const save = () =>
    start(async () => {
      const res = await onSave(draft);
      setError(res.error);
      setConfirming(false);
      if (!res.error) {
        setSaved(draft);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-right text-xs font-medium text-muted-foreground">Track opens and clicks</p>
      {[...groups].map(([group, rows]) => (
        <div key={group} className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">{group}</p>
          {rows.map((r) => (
            <div key={r.event} className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{r.label}</span>
                {r.locked && <span className="text-xs text-muted-foreground">{LOCKED_COPY}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.locked && <Badge variant="secondary">Always off</Badge>}
                <Switch
                  aria-label={`Track opens and clicks for ${r.label}`}
                  checked={draft.includes(r.event)}
                  disabled={r.locked || pending}
                  onCheckedChange={(on) => setDraft((d) => (on ? [...d, r.event] : d.filter((e) => e !== r.event)))}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button disabled={pending || changes.length === 0} onClick={() => setConfirming(true)}>
          {changes.length ? `Save changes (${changes.length})` : "Save changes"}
        </Button>
        {error && (
          <Button variant="outline" disabled={pending} onClick={save}>
            Retry
          </Button>
        )}
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save tracking changes?</DialogTitle>
            <DialogDescription>These apply to emails sent from now on.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-sm">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={save}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LoadErrorAlert({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}
