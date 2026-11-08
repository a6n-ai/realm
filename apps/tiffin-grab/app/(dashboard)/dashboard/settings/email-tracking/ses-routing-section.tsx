"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Switch } from "@foundry/ui/switch";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";
import { EVENT_NAME, FORCED_NOTE, STREAM_NAME, routingChanges, streamSummary } from "./event-names";

const FORCED: readonly EmailEventType[] = ["bounce", "complaint"];
type SaveResult = Promise<{ error?: string }>;
type Save = (id: string, r: { webhook: EmailEventType[]; counts?: EmailEventType[] }) => SaveResult;

export interface StreamState {
  stream: EmailStream;
  routing: EmailEventRouting;
  volume: Partial<Record<EmailEventType, number>>;
  error?: string;
}

const toggle = (list: EmailEventType[], t: EmailEventType) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

export function SesRoutingSection({ streams, onSave }: { streams: StreamState[]; onSave: Save }) {
  if (streams.length === 0) return <p className="text-sm text-muted-foreground">Not set up for this app.</p>;
  return (
    <div className="flex flex-col gap-6">
      {streams.map((s) => (
        <StreamBlock key={s.stream.id} state={s} onSave={onSave} />
      ))}
    </div>
  );
}

function StreamBlock({ state, onSave }: { state: StreamState; onSave: Save }) {
  const { stream, volume } = state;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(state.routing);
  const [draft, setDraft] = useState(state.routing);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const rows = EMAIL_EVENT_TYPES.filter((t) => stream.kind !== "untracked" || (t !== "open" && t !== "click"));
  const changes = routingChanges(saved, draft, FORCED);
  const summary = streamSummary(saved);

  const save = () =>
    start(async () => {
      const res = await onSave(stream.id, draft.counts ? { webhook: draft.webhook, counts: draft.counts } : { webhook: draft.webhook });
      setError(res.error);
      if (!res.error) {
        setSaved(draft);
        setOpen(false);
        toast.success(`${STREAM_NAME[stream.kind]} saved`);
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
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-medium">{STREAM_NAME[stream.kind]}</h3>
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{summary.logs}</p>
            <p className="text-sm text-muted-foreground">{summary.totals}</p>
          </>
        )}
      </div>
      {!state.error && (
        <Button variant="outline" onClick={() => onOpenChange(true)}>
          Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{STREAM_NAME[stream.kind]}</DialogTitle>
            <DialogDescription>Changes apply to everything sent as {STREAM_NAME[stream.kind].toLowerCase()}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-2">
            <span />
            <span className="text-xs font-medium text-muted-foreground">Show per email in Logs</span>
            <span className="text-xs font-medium text-muted-foreground">Count in totals</span>
            {rows.map((t) => {
              const forced = FORCED.includes(t);
              return (
                <div key={t} className="contents">
                  <div className="flex flex-col">
                    <span className="text-sm">{EVENT_NAME[t]}</span>
                    <span className="min-h-4 text-xs tabular-nums text-muted-foreground">
                      {forced ? FORCED_NOTE : volume[t] !== undefined ? `Last 30 days: ${volume[t]?.toLocaleString()}` : " "}
                    </span>
                  </div>
                  <Switch
                    size="sm"
                    aria-label={`${EVENT_NAME[t]}: show per email in Logs`}
                    checked={forced || draft.webhook.includes(t)}
                    disabled={forced || pending}
                    onCheckedChange={() => setDraft((d) => ({ ...d, webhook: toggle(d.webhook, t) }))}
                  />
                  {draft.counts === null ? (
                    <Badge variant="outline">Not set up</Badge>
                  ) : (
                    <Switch
                      size="sm"
                      aria-label={`${EVENT_NAME[t]}: count in totals`}
                      checked={draft.counts.includes(t)}
                      disabled={pending}
                      onCheckedChange={() => setDraft((d) => ({ ...d, counts: toggle(d.counts ?? [], t) }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={pending || changes.length === 0} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
