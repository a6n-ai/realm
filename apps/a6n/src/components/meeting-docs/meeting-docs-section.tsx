import { ErrorState } from "@foundry/console/error-state";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { toast } from "@foundry/ui/toast";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toDateInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { listMeetingDocsFn, startMeetingDocFn } from "../../lib/meeting-docs/meeting-docs.fns";
import type { DocSummary } from "../../lib/meeting-docs/service";
import { LINK } from "../link-class";
import { RelativeTime } from "../relative-time";

type State = { docs: DocSummary[] } | { error: unknown } | null;

export function MeetingDocsSection({ inquiryId, canShare }: { inquiryId: string; canShare: boolean }) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setState(null);
    try {
      setState({ docs: (await listMeetingDocsFn({ data: { inquiryId } })) ?? [] });
    } catch (error) {
      setState({ error });
    }
  }, [inquiryId]);
  useEffect(() => void load(), [load]);

  async function start() {
    setStarting(true);
    try {
      const res = await startMeetingDocFn({ data: { inquiryId, localDate: toDateInput(Date.now()) } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      await navigate({ to: "/inquiries/$id/docs/$docId", params: { id: inquiryId, docId: res.id } });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setStarting(false);
    }
  }

  const startButton = canShare ? (
    <Button variant="outline" size="sm" disabled={starting} onClick={() => void start()}>
      <PlusIcon aria-hidden className="size-4" />
      Start meeting doc
    </Button>
  ) : null;

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Meeting docs</h2>
        {state && "docs" in state && state.docs.length ? startButton : null}
      </div>
      {state === null ? (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : "error" in state ? (
        <ErrorState error={state.error} errorText={errorText} onRetry={() => void load()} />
      ) : state.docs.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground">No meeting docs yet</p>
          {startButton}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {state.docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <div className="grid min-w-0">
                <Link to="/inquiries/$id/docs/$docId" params={{ id: inquiryId, docId: d.id }} className={`truncate font-medium ${LINK}`}>
                  {d.title}
                </Link>
                <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{d.createdByName ?? "Someone"}</span>
                  <RelativeTime at={d.createdAt} />
                  <span>
                    {d.activeShares} active {d.activeShares === 1 ? "link" : "links"}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
