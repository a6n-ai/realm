"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Switch } from "@foundry/ui/switch";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";
import { EVENT_NAME, FORCED_NOTE, STREAM_NAME, routingChanges } from "./event-names";

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
  return (
    <Collapsible className="flex flex-col gap-4">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 text-left">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Advanced: SES routing</span>
          <span className="text-xs text-muted-foreground">Where each email event is sent. Most teams never change this.</span>
        </span>
        <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-6">
        {streams.length === 0 ? (
          <Alert variant="info">
            <AlertDescription>SES streams aren&apos;t configured for this app.</AlertDescription>
          </Alert>
        ) : (
          streams.map((s) => <StreamBlock key={s.stream.id} state={s} onSave={onSave} />)
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StreamBlock({ state, onSave }: { state: StreamState; onSave: Save }) {
  const { stream, volume } = state;
  const router = useRouter();
  const [saved, setSaved] = useState(state.routing);
  const [draft, setDraft] = useState(state.routing);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const rows = EMAIL_EVENT_TYPES.filter((t) => stream.kind !== "untracked" || (t !== "open" && t !== "click"));
  const changes = routingChanges(saved, draft, FORCED);

  const save = () =>
    start(async () => {
      const res = await onSave(stream.id, draft.counts ? { webhook: draft.webhook, counts: draft.counts } : { webhook: draft.webhook });
      setError(res.error);
      setConfirming(false);
      if (!res.error) setSaved(draft);
    });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{STREAM_NAME[stream.kind]}</h3>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
          <RetryButton onClick={() => router.refresh()} />
        </Alert>
      ) : (
        <>
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
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {forced ? FORCED_NOTE : volume[t] !== undefined ? `Last 30 days: ${volume[t]?.toLocaleString()}` : " "}
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
              <RetryButton onClick={save} disabled={pending} />
            </Alert>
          )}
          <div>
            <Button variant="outline" size="sm" disabled={pending || changes.length === 0} onClick={() => setConfirming(true)}>
              Save {STREAM_NAME[stream.kind]}
            </Button>
          </div>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save {STREAM_NAME[stream.kind]} routing?</DialogTitle>
                <DialogDescription>These changes apply to everything sent as {STREAM_NAME[stream.kind].toLowerCase()}.</DialogDescription>
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
        </>
      )}
    </div>
  );
}

function RetryButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <AlertAction>
      <Button type="button" variant="outline" size="sm" disabled={disabled || pending} onClick={() => start(onClick)}>
        Retry
      </Button>
    </AlertAction>
  );
}
