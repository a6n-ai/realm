"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecksIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionCard, ResponsiveDialog } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { deleteMealRuleSafe, saveMealRule } from "./actions";
import {
  ANY,
  RuleForm,
  emptyDraft,
  type Draft,
  type KeyOption,
  type Option,
} from "./rule-builder";

export type ListRule = {
  publicId: string;
  name: string | null;
  /** Already rendered server-side by the same generator customers see. */
  sentence: string;
  scopeLabel: string;
  enabled: boolean;
  draft: Draft;
};

export function RulesList({
  rules,
  dishes,
  diets,
  categories,
  mealSizes,
  plans,
}: {
  rules: ListRule[];
  dishes: Option[];
  diets: Option[];
  categories: KeyOption[];
  mealSizes: Option[];
  plans: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft());
  const [saving, setSaving] = React.useState(false);
  // Shown inside the dialog, next to the field the admin must fix.
  const [formError, setFormError] = React.useState<string | null>(null);

  const openNew = () => {
    setDraft(emptyDraft());
    setFormError(null);
    setOpen(true);
  };
  const openEdit = (r: ListRule) => {
    setDraft(r.draft);
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await saveMealRule({
        publicId: draft.publicId,
        name: draft.name,
        description: draft.description || null,
        // "Any" is the absence of a scope, not a value the server should resolve.
        scopePlanPublicId: draft.scopePlanPublicId === ANY ? null : draft.scopePlanPublicId,
        scopeMealSizePublicId: draft.scopeMealSizePublicId === ANY ? null : draft.scopeMealSizePublicId,
        matchMode: draft.matchMode,
        action: draft.action,
        actionValue: draft.action === "max_qualifying" ? Number(draft.actionValue) : null,
        enabled: draft.enabled,
        conditions: draft.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          valuePublicIds: c.valuePublicIds,
          valueKeys: c.valueKeys,
          valueText: c.valueText,
        })),
      });
      // The action returns its error; a thrown one would reach us redacted.
      if ("error" in res) {
        setFormError(res.error);
        return;
      }
      toast.success(draft.publicId ? "Rule updated" : "Rule created");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the rule");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ListRule) => {
    const res = await deleteMealRuleSafe({ id: r.publicId });
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Rule deleted");
    router.refresh();
  };

  return (
    <SectionCard
      title="Meal rules"
      subtitle="Extra limits on the final meal. Meal size composition, TU limits and swap rules are set elsewhere."
      action={
        <Button type="button" size="sm" className="gap-1.5" onClick={openNew}>
          <PlusIcon className="size-3.5" /> New rule
        </Button>
      }
    >
      {rules.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
          <ListChecksIcon className="size-5" />
          <p>No meal rules yet. Customers can pick anything their meal size allows.</p>
        </div>
      ) : (
        <ul className="divide-border/60 divide-y">
          {rules.map((r) => (
            <li key={r.publicId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.name ?? "Untitled rule"}</span>
                  {!r.enabled ? <Badge variant="outline">Off</Badge> : null}
                  <Badge variant="secondary">{r.scopeLabel}</Badge>
                </div>
                {/* The exact sentence a customer reads — no enum or id wording. */}
                <p className="text-muted-foreground mt-0.5 text-sm text-pretty">{r.sentence}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${r.name ?? "rule"}`}
                  onClick={() => openEdit(r)}>
                  <PencilIcon className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${r.name ?? "rule"}`}
                  onClick={() => remove(r)}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.publicId ? "Edit meal rule" : "New meal rule"}
        description="Set constraints on dish combinations customers can select in a meal."
        contentClassName="sm:max-w-2xl"
        footer={
          <div className="flex flex-col gap-3">
            {formError ? (
              <p role="alert" className="text-destructive text-sm text-pretty">{formError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save rule"}
            </Button>
            </div>
          </div>
        }
      >
        <RuleForm draft={draft} setDraft={setDraft} dishes={dishes} diets={diets}
          categories={categories} mealSizes={mealSizes} plans={plans} />
      </ResponsiveDialog>
    </SectionCard>
  );
}
