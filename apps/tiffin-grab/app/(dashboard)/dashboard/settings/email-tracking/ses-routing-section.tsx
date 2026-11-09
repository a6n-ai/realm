"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@foundry/ui/card";
import { Separator } from "@foundry/ui/separator";
import { Switch } from "@foundry/ui/switch";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";
import { LoadErrorAlert, SaveBar } from "./email-tracking-section";
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
const COL = "w-20 shrink-0 text-center";

export function SesRoutingSection({ streams, onSave }: { streams: StreamState[]; onSave: Save }) {
  if (streams.length === 0) return <p className="text-sm text-muted-foreground">Not set up for this app.</p>;
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Where each email event is sent. The defaults work — you don&apos;t need to change this.
      </p>
      {streams.map((s) => (
        <StreamList key={s.stream.id} state={s} onSave={onSave} />
      ))}
    </div>
  );
}

function StreamList({ state, onSave }: { state: StreamState; onSave: Save }) {
  const { stream, volume } = state;
  const name = STREAM_NAME[stream.kind];
  const [saved, setSaved] = useState(state.routing);
  const [draft, setDraft] = useState(state.routing);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const rows = EMAIL_EVENT_TYPES.filter((t) => stream.kind !== "untracked" || (t !== "open" && t !== "click"));
  const dirty = routingChanges(saved, draft, FORCED).length > 0;

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
    <section className="flex flex-col gap-3">
      {state.error ? (
        <>
          <h3 className="text-sm font-medium">{name}</h3>
          <LoadErrorAlert message={state.error} />
        </>
      ) : (
        <>
          <SaveBar
            status={dirty ? `${name} · unsaved changes` : name}
            dirty={dirty}
            pending={pending}
            error={error}
            onReset={() => setDraft(saved)}
            onSave={save}
          />
          <Card className="p-0">
            <FieldGroup className="gap-0">
              <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Event</span>
                <span className={COL}>In Logs</span>
                <span className={COL}>In totals</span>
              </div>
              {rows.map((t) => {
                const forced = FORCED.includes(t);
                const hint = forced ? FORCED_NOTE : volume[t] !== undefined ? `Last 30 days: ${volume[t]?.toLocaleString()}` : undefined;
                return (
                  <Fragment key={t}>
                    <Separator />
                    <Field orientation="horizontal" className="px-4 py-3">
                      <FieldContent>
                        <FieldTitle>{EVENT_NAME[t]}</FieldTitle>
                        {hint && <FieldDescription className="text-xs tabular-nums">{hint}</FieldDescription>}
                      </FieldContent>
                      <span className={COL}>
                        <Switch
                          size="sm"
                          aria-label={`${EVENT_NAME[t]}: show per email in Logs`}
                          checked={forced || draft.webhook.includes(t)}
                          disabled={forced || pending}
                          onCheckedChange={() => setDraft((d) => ({ ...d, webhook: toggle(d.webhook, t) }))}
                        />
                      </span>
                      <span className={COL}>
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
                      </span>
                    </Field>
                  </Fragment>
                );
              })}
            </FieldGroup>
          </Card>
        </>
      )}
    </section>
  );
}
