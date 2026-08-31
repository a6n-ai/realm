"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { ResponsiveDialog, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { apiFetch } from "@/lib/http/api-fetch";
import { toastSyncErrors } from "@/lib/http/sync-errors";
import { CloverColorSwatch } from "@/components/products/clover-color-swatch";
import type { AssociationKind, AssociationRef } from "@/lib/services/inventory.service";

type PushResult = { pushed: { errors: Array<{ publicId: string; message: string }> } | null };

/**
 * One of Clover's "Assign …" relation blocks: a header action that opens a
 * picker, and a table of what is currently assigned. Saving writes immediately
 * (and pushes to Clover) rather than joining the item form's Save — Clover
 * treats these as their own mutations, and a half-saved relation is worse than
 * an explicit one.
 */
export function AssociationSection({
  productPublicId,
  kind,
  title,
  subtitle,
  assignLabel,
  columns,
  emptyMessage,
  assigned,
  options,
  disabled,
  disabledReason,
}: {
  productPublicId: string;
  kind: AssociationKind;
  title: string;
  subtitle: string;
  assignLabel: string;
  /** [name column, detail column] headers — mirrors Clover's two-column tables. */
  columns: [string, string];
  emptyMessage: string;
  assigned: AssociationRef[];
  options: AssociationRef[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Seed the picker at open time, not in an effect — an effect here would set
  // state during render and cascade.
  function openDialog() {
    setSelected(new Set(assigned.map((a) => a.publicId)));
    setQuery("");
    setOpen(true);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch<PushResult>(`/api/products/${productPublicId}/associations`, {
        method: "PUT",
        body: JSON.stringify({ kind, publicIds: [...selected] }),
      });
      toastSyncErrors(res.pushed?.errors, "Saved locally, but Clover rejected the push");
      setOpen(false);
      router.refresh();
    } catch {
      // apiFetch already toasted.
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      action={
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={openDialog}
        >
          <PlusIcon className="size-3.5" />
          {assignLabel}
        </Button>
      }
    >
      {assigned.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          {emptyMessage}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{columns[0]}</TableHead>
              <TableHead>{columns[1]}</TableHead>
              <TableHead className="text-right">Clover id</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assigned.map((row) => (
              <TableRow key={row.publicId}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <CloverColorSwatch color={row.detail} size={12} />
                    {row.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.detail ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-right font-mono text-xs">
                  {row.cloverId ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={assignLabel}
        contentClassName="sm:max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-4 py-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {visible.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {options.length === 0 ? emptyMessage : "Nothing matches that search."}
            </p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {visible.map((o) => (
                <li key={o.publicId}>
                  {/* Native checkbox: @foundry/ui has no Checkbox, and this needs nothing more. */}
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={selected.has(o.publicId)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.publicId)) next.delete(o.publicId);
                          else next.add(o.publicId);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {o.detail ? (
                      <span className="text-muted-foreground shrink-0 text-xs">{o.detail}</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsiveDialog>
    </SectionCard>
  );
}
