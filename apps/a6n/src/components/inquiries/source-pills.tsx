import { Button } from "@foundry/ui/button";
import type { SourceRow, SubsourceRow } from "../../lib/inquiries/sources";

function Pills({ label, items, value, onChange }: { label: string; items: { key: string; label: string }[]; value: string | null; onChange: (key: string | null) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = item.key === value;
        return (
          <Button key={item.key} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => onChange(on ? null : item.key)}>
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export function SourcePills({
  sources,
  subsources,
  source,
  subSource,
  onChange,
}: {
  sources: Pick<SourceRow, "id" | "key" | "label">[];
  subsources: Pick<SubsourceRow, "sourceId" | "key" | "label">[];
  source: string | null;
  subSource: string | null;
  onChange: (next: { source: string | null; subSource: string | null }) => void;
}) {
  const sourceId = sources.find((s) => s.key === source)?.id;
  const subs = subsources.filter((s) => s.sourceId === sourceId);
  return (
    <div className="grid gap-3">
      <Pills label="Source" items={sources} value={source} onChange={(key) => onChange({ source: key, subSource: null })} />
      {subs.length > 0 ? <Pills label="Sub-source" items={subs} value={subSource} onChange={(key) => onChange({ source, subSource: key })} /> : null}
    </div>
  );
}
