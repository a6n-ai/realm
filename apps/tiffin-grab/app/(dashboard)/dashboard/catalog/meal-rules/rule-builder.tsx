"use client";

import * as React from "react";
import { ChevronsUpDown, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { OPERATORS_BY_FIELD, type MealRuleField, type MealRuleOperator } from "@/lib/menu/meal-rule-types";
import { FIELD_LABEL, valueKindFor } from "@/lib/menu/meal-rule-input";

export type Option = { publicId: string; label: string };
export type KeyOption = { key: string; label: string };

export type DraftCondition = {
  field: MealRuleField;
  operator: MealRuleOperator;
  valuePublicIds: string[];
  valueKeys: string[];
  valueText: string;
};

export type Draft = {
  publicId?: string;
  name: string;
  description: string;
  scopePlanPublicId: string;
  scopeMealSizePublicId: string;
  matchMode: "all" | "any";
  action: "max_qualifying" | "forbid" | "cannot_coexist";
  actionValue: string;
  enabled: boolean;
  conditions: DraftCondition[];
};

export const ANY = "__any__";

export function emptyCondition(): DraftCondition {
  return { field: "category", operator: "is", valuePublicIds: [], valueKeys: [], valueText: "" };
}

export function emptyDraft(): Draft {
  return {
    name: "",
    description: "",
    scopePlanPublicId: ANY,
    scopeMealSizePublicId: ANY,
    matchMode: "all",
    action: "max_qualifying",
    actionValue: "1",
    enabled: true,
    conditions: [emptyCondition()],
  };
}

// Admin-facing wording. The stored values stay as they are; only the labels
// differ, so nothing in the engine depends on this.
const OPERATOR_LABEL: Record<MealRuleOperator, string> = {
  is: "is",
  is_not: "is not",
  is_one_of: "is one of",
  is_not_one_of: "is not one of",
  contains: "contains",
  not_contains: "does not contain",
  equals: "equals",
  starts_with: "starts with",
  ends_with: "ends with",
};

const FIELD_ORDER: MealRuleField[] = ["dish_plan", "category", "dish", "dish_name"];

function multiValued(op: MealRuleOperator): boolean {
  return op === "is_one_of" || op === "is_not_one_of";
}

/** Searchable single/multi picker — the admin never sees an id. */
function ValuePicker({
  options,
  selected,
  onChange,
  multiple,
  placeholder,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const labelFor = (id: string) => options.find((o) => o.publicId === id)?.label ?? "(deleted)";

  const toggle = (id: string) => {
    if (multiple) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange([id]);
      setOpen(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open}
            className="w-full justify-between font-normal">
            <span className="truncate">
              {selected.length === 0
                ? placeholder
                : multiple
                  ? `${selected.length} selected`
                  : labelFor(selected[0]!)}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.publicId} value={o.label} data-checked={selected.includes(o.publicId)}
                    aria-checked={selected.includes(o.publicId)} onSelect={() => toggle(o.publicId)}>
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {selected.map((id) => (
            <li key={id}>
              <Badge variant="secondary" className="gap-1">
                {labelFor(id)}
                <button type="button" aria-label={`Remove ${labelFor(id)}`}
                  onClick={() => onChange(selected.filter((s) => s !== id))}>×</button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
  dishes,
  diets,
  categories,
}: {
  condition: DraftCondition;
  onChange: (next: DraftCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
  dishes: Option[];
  diets: Option[];
  categories: KeyOption[];
}) {
  const operators = OPERATORS_BY_FIELD[condition.field];
  const kind = valueKindFor(condition.field);
  const multiple = multiValued(condition.operator);

  // Changing the field invalidates both the operator and the value, so reset
  // them rather than carrying an illegal pair the server would reject.
  const setField = (field: MealRuleField) =>
    onChange({ ...emptyCondition(), field, operator: OPERATORS_BY_FIELD[field][0]! });

  const setOperator = (operator: MealRuleOperator) => {
    // Narrowing "is one of" to "is" can leave several values selected.
    const keep = multiValued(operator);
    onChange({
      ...condition,
      operator,
      valuePublicIds: keep ? condition.valuePublicIds : condition.valuePublicIds.slice(0, 1),
      valueKeys: keep ? condition.valueKeys : condition.valueKeys.slice(0, 1),
    });
  };

  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-start">
      <Select value={condition.field} onValueChange={(v) => setField(v as MealRuleField)}>
        <SelectTrigger aria-label="Field"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FIELD_ORDER.map((f) => <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={(v) => setOperator(v as MealRuleOperator)}>
        <SelectTrigger aria-label="Operator"><SelectValue /></SelectTrigger>
        <SelectContent>
          {/* Only operators this field supports — an invalid pair can't be built. */}
          {operators.map((o) => <SelectItem key={o} value={o}>{OPERATOR_LABEL[o]}</SelectItem>)}
        </SelectContent>
      </Select>

      {kind === "text" ? (
        <Input aria-label="Value" placeholder="e.g. Paneer" value={condition.valueText}
          onChange={(e) => onChange({ ...condition, valueText: e.target.value })} />
      ) : kind === "keys" ? (
        <ValuePicker
          options={categories.map((c) => ({ publicId: c.key, label: c.label }))}
          selected={condition.valueKeys}
          onChange={(next) => onChange({ ...condition, valueKeys: next })}
          multiple={multiple}
          placeholder="Choose a category"
        />
      ) : (
        <ValuePicker
          options={condition.field === "dish" ? dishes : diets}
          selected={condition.valuePublicIds}
          onChange={(next) => onChange({ ...condition, valuePublicIds: next })}
          multiple={multiple}
          placeholder={condition.field === "dish" ? "Choose a dish" : "Choose a diet"}
        />
      )}

      <Button type="button" variant="ghost" size="icon" aria-label="Remove condition"
        disabled={!canRemove} onClick={onRemove}>
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

export function RuleForm({
  draft,
  setDraft,
  dishes,
  diets,
  categories,
  mealSizes,
  plans,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  dishes: Option[];
  diets: Option[];
  categories: KeyOption[];
  mealSizes: Option[];
  plans: Option[];
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setCondition = (i: number, next: DraftCondition) =>
    set({ conditions: draft.conditions.map((c, j) => (j === i ? next : c)) });

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="rule-name">Rule name</Label>
        <Input id="rule-name" placeholder="e.g. One non-veg sabzi" value={draft.name}
          onChange={(e) => set({ name: e.target.value })} />
        <p className="text-muted-foreground text-xs">Only staff see this.</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rule-description">What customers see</Label>
        <Textarea id="rule-description" rows={2} value={draft.description}
          placeholder="Leave blank and we’ll write it from the rule."
          onChange={(e) => set({ description: e.target.value })} />
        <p className="text-muted-foreground text-xs">
          Shown in Pick meals, and again if a choice is refused.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Applies to plan</Label>
          <Select value={draft.scopePlanPublicId} onValueChange={(v) => set({ scopePlanPublicId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any plan</SelectItem>
              {plans.map((p) => <SelectItem key={p.publicId} value={p.publicId}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Applies to meal size</Label>
          <Select value={draft.scopeMealSizePublicId} onValueChange={(v) => set({ scopeMealSizePublicId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any meal size</SelectItem>
              {mealSizes.map((m) => <SelectItem key={m.publicId} value={m.publicId}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-primary text-xs font-semibold tracking-wide uppercase">When</Label>
          <Select value={draft.matchMode} onValueChange={(v) => set({ matchMode: v as "all" | "any" })}>
            <SelectTrigger className="h-8 w-36" aria-label="Match mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all of these</SelectItem>
              <SelectItem value="any">any of these</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">match a dish</span>
        </div>

        <div className="grid gap-2">
          {draft.conditions.map((c, i) => (
            <ConditionRow key={i} condition={c} canRemove={draft.conditions.length > 1}
              onChange={(next) => setCondition(i, next)}
              onRemove={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })}
              dishes={dishes} diets={diets} categories={categories} />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5"
          onClick={() => set({ conditions: [...draft.conditions, emptyCondition()] })}>
          <PlusIcon className="size-3.5" /> Add condition
        </Button>
      </div>

      <div className="grid gap-2">
        <Label className="text-primary text-xs font-semibold tracking-wide uppercase">Then</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={draft.action} onValueChange={(v) => set({ action: v as Draft["action"] })}>
            <SelectTrigger className="w-60" aria-label="Action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="max_qualifying">Allow at most…</SelectItem>
              <SelectItem value="forbid">Don’t allow these at all</SelectItem>
              <SelectItem value="cannot_coexist">Allow only one of these together</SelectItem>
            </SelectContent>
          </Select>
          {draft.action === "max_qualifying" ? (
            <Input type="number" min={0} max={99} aria-label="Maximum" className="w-24"
              value={draft.actionValue} onChange={(e) => set({ actionValue: e.target.value })} />
          ) : null}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        Enabled
      </label>
    </div>
  );
}
