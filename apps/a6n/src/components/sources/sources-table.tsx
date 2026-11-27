import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Switch } from "@foundry/ui/switch";
import { useRouter } from "@tanstack/react-router";
import { TagIcon } from "lucide-react";
import { errorText } from "../../lib/error-copy";
import { setSourceActiveFn, setSubsourceActiveFn } from "../../lib/inquiries/sources.fns";
import type { SourceRow, SubsourceRow } from "../../lib/inquiries/sources";
import { EmptyState } from "../page/empty-state";
import { Panel } from "../page/panel";
import { useCreate } from "../shell/create-dialogs";
import { SourceDialog } from "./source-dialog";

export function SourcesTable({ sources, subsources, filtered = false }: { sources: SourceRow[]; subsources: SubsourceRow[]; filtered?: boolean }) {
  const router = useRouter();
  const create = useCreate();
  const toggle = (fn: typeof setSourceActiveFn, id: string, active: boolean) =>
    runAction(() => fn({ data: { id, active } }), active ? "Activated" : "Deactivated", () => router.invalidate(), errorText);

  if (sources.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={TagIcon}
          title={filtered ? "No sources match" : "No sources yet"}
          description={filtered ? "Clear the filter to see every source." : "Add the channels inquiries come from."}
          action={filtered ? undefined : <Button onClick={() => create("source")}>New source</Button>}
        />
      </Panel>
    );
  }
  return (
    <Panel>
      <div className="divide-y">
        {sources.map((s) => (
          <section key={s.id} aria-label={s.label} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-medium text-(--strong)">{s.label}</h2>
              <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
              {s.active ? null : <Badge variant="neutral">Inactive</Badge>}
              <span className="ml-auto flex items-center gap-2">
                <SourceDialog mode={{ kind: "rename", id: s.id, label: s.label }} />
                <SourceDialog mode={{ kind: "subsource", sourceId: s.id, sourceLabel: s.label }} />
                <Switch checked={!!s.active} onCheckedChange={(v) => void toggle(setSourceActiveFn, s.id, v)} aria-label={`${s.label} active`} />
              </span>
            </div>
            <ul className="grid gap-2">
              {subsources
                .filter((x) => x.sourceId === s.id)
                .map((x) => (
                  <li key={x.id} className="flex items-center gap-3 text-sm">
                    <span>{x.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{x.key}</span>
                    <Switch className="ml-auto" checked={!!x.active} onCheckedChange={(v) => void toggle(setSubsourceActiveFn, x.id, v)} aria-label={`${x.label} active`} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}
