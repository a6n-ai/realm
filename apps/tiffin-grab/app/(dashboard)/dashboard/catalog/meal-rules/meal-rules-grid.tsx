"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecksIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionCard, DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { mealRuleConditionLabel } from "../admin-tu-hints";
import { deleteMealRule, updateMealRule, upsertMealRule } from "./actions";

export type MealRuleRow = {
  id: string;
  planPublicId: string;
  planName: string;
  categoryKey: string;
  categoryLabel: string;
  condition: "exclusive_to_plan";
  maxCount: number;
  enabled: boolean;
};

type PlanOption = { publicId: string; name: string; tagColor: string | null };
type CategoryOption = { key: string; label: string };

type Cols = "plan" | "category" | "rule" | "maximum" | "status" | "actions";
const COLUMNS: readonly Column<Cols>[] = [
  { key: "plan", label: "Plan" },
  { key: "category", label: "Category" },
  { key: "rule", label: "Rule" },
  { key: "maximum", label: "Maximum", align: "right" },
  { key: "status", label: "Status" },
  { key: "actions", label: "", align: "right" },
];

/** Only condition currently supported — stored as exclusive_to_plan. */
const RULE_OPTIONS = [
  { value: "exclusive_to_plan" as const, label: "Maximum number of plan-exclusive dishes" },
];

export function MealRulesGrid({
  rules,
  planOptions,
  categoryOptions,
}: {
  rules: MealRuleRow[];
  planOptions: PlanOption[];
  categoryOptions: CategoryOption[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<MealRuleRow | null>(null);

  return (
    <SectionCard
      title="Configured rules"
      subtitle="Meal sizes define the starting meal. Swap rules define exchanges. Meal rules limit what the finished meal may contain."
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon data-icon="inline-start" /> Add rule
        </Button>
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={rules}
        rowKey={(r) => r.id}
        serial={false}
        emptyIcon={ListChecksIcon}
        emptyMessage="No rules configured"
        renderRow={(rule) => (
          <>
            <TableCell className="text-sm font-medium">{rule.planName}</TableCell>
            <TableCell className="text-sm">{rule.categoryLabel}</TableCell>
            <TableCell className="text-sm">{mealRuleConditionLabel(rule.condition)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums">{rule.maxCount}</TableCell>
            <TableCell>
              <Badge variant={rule.enabled ? "secondary" : "outline"} className="text-xs font-normal">
                {rule.enabled ? "Active" : "Disabled"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(rule)} aria-label="Edit meal rule">
                  <PencilIcon className="size-4" />
                </Button>
                <DeleteButton rule={rule} />
              </div>
            </TableCell>
          </>
        )}
      />

      <MealRuleDialog
        key="new"
        open={adding}
        onOpenChange={setAdding}
        planOptions={planOptions}
        categoryOptions={categoryOptions}
        existingKeys={rules.map((r) => `${r.planPublicId}:${r.categoryKey}:${r.condition}`)}
      />

      {editing ? (
        <MealRuleDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          planOptions={planOptions}
          categoryOptions={categoryOptions}
          existingKeys={[]}
          editing={editing}
        />
      ) : null}
    </SectionCard>
  );
}

function DeleteButton({ rule }: { rule: MealRuleRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={pending}
      aria-label="Delete meal rule"
      onClick={() =>
        start(async () => {
          try {
            await deleteMealRule({ id: rule.id });
            toast.success("Meal rule deleted");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
          }
        })
      }
    >
      <Trash2Icon className="size-4" />
    </Button>
  );
}

function MealRuleDialog({
  open,
  onOpenChange,
  planOptions,
  categoryOptions,
  existingKeys,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planOptions: PlanOption[];
  categoryOptions: CategoryOption[];
  existingKeys: string[];
  editing?: MealRuleRow;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [planPublicId, setPlanPublicId] = React.useState(editing?.planPublicId ?? "");
  const [categoryKey, setCategoryKey] = React.useState(editing?.categoryKey ?? "");
  const [condition, setCondition] = React.useState<"exclusive_to_plan">(editing?.condition ?? "exclusive_to_plan");
  const [maxCount, setMaxCount] = React.useState(String(editing?.maxCount ?? 1));
  const [enabled, setEnabled] = React.useState(editing?.enabled ?? true);

  const duplicateKey = !editing && planPublicId && categoryKey
    ? existingKeys.includes(`${planPublicId}:${categoryKey}:${condition}`)
    : false;

  const save = () => {
    const n = Number(maxCount);
    if (!planPublicId || !categoryKey) {
      toast.error("Select a plan and category");
      return;
    }
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Maximum must be greater than 0.");
      return;
    }
    if (duplicateKey) {
      toast.error("That rule already exists — edit it instead");
      return;
    }
    start(async () => {
      try {
        if (editing) {
          await updateMealRule({ id: editing.id, maxCount: n, enabled });
          toast.success("Meal rule updated");
        } else {
          await upsertMealRule({ planPublicId, categoryKey, condition, maxCount: n, enabled });
          toast.success("Meal rule saved");
        }
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit meal rule" : "Add meal rule"}
      description="Limits apply when customers pick dishes. Plan-exclusive dishes are those available only on this plan among sibling plans."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || duplicateKey}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Plan</span>
          <Select value={planPublicId} onValueChange={setPlanPublicId} disabled={Boolean(editing)}>
            <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
            <SelectContent>
              {planOptions.map((p) => (
                <SelectItem key={p.publicId} value={p.publicId}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Category</span>
          <Select value={categoryKey} onValueChange={setCategoryKey} disabled={Boolean(editing)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Rule</span>
          <Select value={condition} onValueChange={(v) => setCondition(v as "exclusive_to_plan")} disabled={Boolean(editing)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RULE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Maximum</span>
          <Input
            className="tabular-nums"
            type="number"
            min={0}
            step={1}
            value={maxCount}
            onChange={(e) => setMaxCount(e.target.value)}
          />
          <span className="text-muted-foreground text-xs">Stored in the database — change anytime without code changes.</span>
        </label>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div>
            <div className="text-sm font-medium">Enabled</div>
            <div className="text-muted-foreground text-xs">Disabled rules are ignored by validation.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        {duplicateKey ? (
          <p className="text-destructive text-sm">A rule for this plan, category, and type already exists.</p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
