"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";
import { LoadErrorAlert, SaveBar, SwitchList } from "./email-tracking-section";
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
          <div className="grid items-start gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">Shown per email in Logs</h4>
              <SwitchList
                rows={rows.map((t) => {
                  const forced = FORCED.includes(t);
                  return {
                    id: t,
                    label: EVENT_NAME[t],
                    hint: forced ? FORCED_NOTE : volume[t] !== undefined ? `Last 30 days: ${volume[t]?.toLocaleString()}` : undefined,
                    checked: forced || draft.webhook.includes(t),
                    disabled: forced || pending,
                    onChange: () => setDraft((d) => ({ ...d, webhook: toggle(d.webhook, t) })),
                  };
                })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">Counted in totals</h4>
              {draft.counts === null ? (
                <p className="text-sm text-muted-foreground">Not set up for {name.toLowerCase()}.</p>
              ) : (
                <SwitchList
                  rows={rows.map((t) => ({
                    id: t,
                    label: EVENT_NAME[t],
                    checked: draft.counts?.includes(t) ?? false,
                    disabled: pending,
                    onChange: () => setDraft((d) => ({ ...d, counts: toggle(d.counts ?? [], t) })),
                  }))}
                />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
