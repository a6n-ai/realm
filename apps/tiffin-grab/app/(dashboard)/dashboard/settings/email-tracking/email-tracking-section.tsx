"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { ScrollArea } from "@foundry/ui/scroll-area";
import { Switch } from "@foundry/ui/switch";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";

export interface EmailTypeRow {
  event: string;
  label: string;
  category: string;
  categoryLabel: string;
  tracked: boolean;
  locked: boolean;
}

export const LOCKED_COPY = "Login and security emails stay untracked so they don't land in spam.";

const groupByCategory = (rows: EmailTypeRow[]) => {
  const groups = new Map<string, EmailTypeRow[]>();
  for (const t of rows) groups.set(t.categoryLabel, [...(groups.get(t.categoryLabel) ?? []), t]);
  return groups;
};

export function TrackedEmailsSummary({ types }: { types: EmailTypeRow[] }) {
  const tracked = groupByCategory(types.filter((t) => t.tracked));
  if (tracked.size === 0) return <p className="text-sm text-muted-foreground">None yet — all emails are sent without tracking.</p>;
  return (
    <div className="flex flex-col gap-4">
      {[...tracked].map(([group, rows]) => (
        <div key={group} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{group}</p>
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <Badge key={r.event} variant="secondary">
                {r.label}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChooseEmailsButton({
  types,
  onSave,
  disabled,
}: {
  types: EmailTypeRow[];
  onSave: (events: string[]) => Promise<{ error?: string }>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const saved = types.filter((t) => t.tracked).map((t) => t.event);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const unchanged = draft.length === saved.length && draft.every((e) => saved.includes(e));

  const save = () =>
    start(async () => {
      const res = await onSave(draft);
      setError(res.error);
      if (!res.error) {
        setOpen(false);
        toast.success("Tracked emails saved");
        router.refresh();
      }
    });

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(saved);
      setError(undefined);
    }
    setOpen(next);
  };

  return (
    <>
      <Button disabled={disabled} onClick={() => onOpenChange(true)}>
        Choose emails
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose emails to track</DialogTitle>
            <DialogDescription>Applies to emails sent from now on.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="flex flex-col gap-6 pr-3">
              {[...groupByCategory(types)].map(([group, rows]) => (
                <div key={group} className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{group}</p>
                  {rows[0]?.locked && <p className="text-xs text-muted-foreground">{LOCKED_COPY}</p>}
                  {rows.map((r) => (
                    <div key={r.event} className="flex items-center justify-between gap-4">
                      <span className="text-sm">{r.label}</span>
                      <Switch
                        aria-label={r.label}
                        checked={draft.includes(r.event)}
                        disabled={r.locked || pending}
                        onCheckedChange={(on) => setDraft((d) => (on ? [...d, r.event] : d.filter((e) => e !== r.event)))}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={pending || unchanged} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
