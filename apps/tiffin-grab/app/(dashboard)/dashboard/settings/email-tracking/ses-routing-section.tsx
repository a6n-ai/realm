"use client";

import { useState, useTransition } from "react";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Switch } from "@foundry/ui/switch";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";
import { LoadErrorAlert } from "./email-tracking-section";
import { EVENT_NAME, FORCED_NOTE, STREAM_NAME, routingChanges } from "./event-names";

const FORCED: readonly EmailEventType[] = ["bounce", "complaint"];
type Save = (id: string, r: { webhook: EmailEventType[]; counts?: EmailEventType[] }) => Promise<{ error?: string }>;

export interface StreamState {
  stream: EmailStream;
  routing: EmailEventRouting;
  volume: Partial<Record<EmailEventType, number>>;
  error?: string;
}

const toggle = (list: EmailEventType[], t: EmailEventType) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

export function SesRoutingSection({ streams, onSave }: { streams: StreamState[]; onSave: Save }) {
  if (streams.length === 0) {
    return (
      <SectionCard title="Advanced">
        <p className="text-sm text-muted-foreground">Not set up for this app.</p>
      </SectionCard>
    );
  }
  return (
    <div className="grid gap-6">
      {streams.map((s) => (
        <StreamCard key={s.stream.id} state={s} onSave={onSave} />
      ))}
    </div>
  );
}

function StreamCard({ state, onSave }: { state: StreamState; onSave: Save }) {
  const { stream, volume } = state;
  const name = STREAM_NAME[stream.kind];
  const [saved, setSaved] = useState(state.routing);
  const [draft, setDraft] = useState(state.routing);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const rows = EMAIL_EVENT_TYPES.filter((t) => stream.kind !== "untracked" || (t !== "open" && t !== "click"));
  const unchanged = routingChanges(saved, draft, FORCED).length === 0;

  const save = () =>
    start(async () => {
      const res = await onSave(stream.id, draft.counts ? { webhook: draft.webhook, counts: draft.counts } : { webhook: draft.webhook });
      setError(res.error);
      if (!res.error) {
        setSaved(draft);
        toast.success(`${name} saved`);
      }
    });

  return (
    <SectionCard title={name} subtitle={`Where events for ${name.toLowerCase()} are sent. You don't need to change this.`}>
      {state.error ? (
        <LoadErrorAlert message={state.error} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-3">
            <span />
            <span className="text-xs font-medium text-muted-foreground">Show per email in Logs</span>
            <span className="text-xs font-medium text-muted-foreground">Count in totals</span>
            {rows.map((t) => {
              const forced = FORCED.includes(t);
              return (
                <div key={t} className="contents">
                  <div className="flex flex-col">
                    <span className="text-sm">{EVENT_NAME[t]}</span>
                    {(forced || volume[t] !== undefined) && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {forced ? FORCED_NOTE : `Last 30 days: ${volume[t]?.toLocaleString()}`}
                      </span>
                    )}
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
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={pending || unchanged} className="gap-2">
              <SaveIcon className="size-4" />
              Save
            </Button>
            {!unchanged && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDraft(saved)}>
                Reset
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
