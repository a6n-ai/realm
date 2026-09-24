"use client";

import * as React from "react";
import {
  BanIcon,
  CheckCircle2Icon,
  ChevronsUpDown,
  HashIcon,
  PlusIcon,
  SparklesIcon,
  SplitIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { OPERATORS_BY_FIELD, type MealRuleField, type MealRuleOperator } from "@/lib/menu/meal-rule-types";
import { FIELD_LABEL, valueKindFor } from "@/lib/menu/meal-rule-input";
import { generateDescription } from "@/lib/menu/meal-rule-text";

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
    <div className="grid w-full gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-background font-normal text-left"
          >
            <span className="truncate">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : multiple ? (
                <span className="font-medium">{selected.length} selected</span>
              ) : (
                labelFor(selected[0]!)
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.publicId}
                    value={o.label}
                    data-checked={selected.includes(o.publicId)}
                    aria-checked={selected.includes(o.publicId)}
                    onSelect={() => toggle(o.publicId)}
                  >
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {selected.map((id) => (
            <li key={id}>
              <Badge variant="secondary" className="gap-1.5 px-2 py-0.5 text-xs font-normal">
                <span>{labelFor(id)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${labelFor(id)}`}
                  className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                >
                  ×
                </button>
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
    <div className="group relative rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-2xs transition-colors hover:border-border">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {/* Field selector */}
        <div className="w-full sm:w-40 sm:shrink-0">
          <Select value={condition.field} onValueChange={(v) => setField(v as MealRuleField)}>
            <SelectTrigger aria-label="Field" className="w-full bg-background font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_ORDER.map((f) => (
                <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Operator selector */}
        <div className="w-full sm:w-36 sm:shrink-0">
          <Select value={condition.operator} onValueChange={(v) => setOperator(v as MealRuleOperator)}>
            <SelectTrigger aria-label="Operator" className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((o) => (
                <SelectItem key={o} value={o}>{OPERATOR_LABEL[o]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Value picker / Text input */}
        <div className="w-full min-w-0 flex-1">
          {kind === "text" ? (
            <Input
              aria-label="Value"
              placeholder="e.g. Paneer"
              value={condition.valueText}
              onChange={(e) => onChange({ ...condition, valueText: e.target.value })}
              className="w-full bg-background"
            />
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
        </div>

        {/* Delete condition */}
        <div className="flex justify-end sm:shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove condition"
            disabled={!canRemove}
            onClick={onRemove}
            className="size-9 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
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

  // Same generator the customer-facing list uses; pure, so it runs client-side.
  const labelOf = (c: DraftCondition): string[] =>
    c.field === "category"
      ? c.valueKeys.map((k) => categories.find((x) => x.key === k)?.label ?? k)
      : c.valuePublicIds.map(
          (id) => (c.field === "dish" ? dishes : diets).find((o) => o.publicId === id)?.label ?? id,
        );

  const preview = draft.description.trim()
    ? draft.description.trim()
    : generateDescription({
        publicId: "preview",
        matchMode: draft.matchMode,
        action: draft.action,
        actionValue: Number(draft.actionValue) || 0,
        priority: 0,
        conditions: draft.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          valueKeys: c.valueKeys,
          valueText: c.valueText || null,
          displayValues: labelOf(c),
        })),
      });

  const setCondition = (i: number, next: DraftCondition) =>
    set({ conditions: draft.conditions.map((c, j) => (j === i ? next : c)) });

  return (
    <div className="space-y-6 p-5 sm:p-6">
      {/* Section 1: Rule Details & Scope */}
      <div className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="rule-name" className="text-sm font-medium">Rule name</Label>
            <Input
              id="rule-name"
              placeholder="e.g. One non-veg sabzi"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="bg-background"
            />
            <p className="text-muted-foreground text-xs">Internal identifier for staff.</p>
          </div>

          <div className="flex items-center gap-2.5 sm:pt-6">
            <Switch
              id="rule-enabled"
              checked={draft.enabled}
              onCheckedChange={(v) => set({ enabled: v })}
            />
            <Label htmlFor="rule-enabled" className="cursor-pointer text-sm font-medium">
              {draft.enabled ? (
                <span className="text-foreground">Active</span>
              ) : (
                <span className="text-muted-foreground">Disabled</span>
              )}
            </Label>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground text-xs font-medium">Applies to plan</Label>
            <Select value={draft.scopePlanPublicId} onValueChange={(v) => set({ scopePlanPublicId: v })}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any plan</SelectItem>
                {plans.map((p) => <SelectItem key={p.publicId} value={p.publicId}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground text-xs font-medium">Applies to meal size</Label>
            <Select value={draft.scopeMealSizePublicId} onValueChange={(v) => set({ scopeMealSizePublicId: v })}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any meal size</SelectItem>
                {mealSizes.map((m) => <SelectItem key={m.publicId} value={m.publicId}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Section 2: Trigger conditions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
              When
            </span>
            <span className="text-muted-foreground text-sm">a dish matches</span>
            <Select value={draft.matchMode} onValueChange={(v) => set({ matchMode: v as "all" | "any" })}>
              <SelectTrigger className="h-8 w-32 bg-background text-xs font-medium" aria-label="Match mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all conditions</SelectItem>
                <SelectItem value="any">any condition</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground text-xs">
            {draft.conditions.length} condition{draft.conditions.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-2">
          {draft.conditions.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 ? (
                <div className="relative flex items-center justify-center py-0.5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/50" />
                  </div>
                  <span className="relative rounded-full border border-border/80 bg-background px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground shadow-2xs">
                    {draft.matchMode === "all" ? "AND" : "OR"}
                  </span>
                </div>
              ) : null}
              <ConditionRow
                condition={c}
                canRemove={draft.conditions.length > 1}
                onChange={(next) => setCondition(i, next)}
                onRemove={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })}
                dishes={dishes}
                diets={diets}
                categories={categories}
              />
            </React.Fragment>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-dashed text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
          onClick={() => set({ conditions: [...draft.conditions, emptyCondition()] })}
        >
          <PlusIcon className="size-3.5" /> Add condition
        </Button>
      </div>

      {/* Section 3: Action */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
              Then
            </span>
            <span className="text-sm font-medium text-foreground">Rule constraint on matching dishes</span>
          </div>
          <span className="text-xs text-muted-foreground">What happens in customer meal</span>
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5 shadow-2xs">
          {/* Action Choice Cards */}
          <div
            role="radiogroup"
            aria-label="Rule constraint"
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
          >
            {/* Card 1: Limit Quantity */}
            <button
              type="button"
              role="radio"
              aria-checked={draft.action === "max_qualifying"}
              onClick={() =>
                set({
                  action: "max_qualifying",
                  actionValue: draft.actionValue && draft.actionValue !== "0" ? draft.actionValue : "1",
                })
              }
              className={cn(
                "group relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draft.action === "max_qualifying"
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                  : "border-border/70 bg-card/60 hover:border-border hover:bg-card"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors",
                    draft.action === "max_qualifying"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <HashIcon className="size-4" />
                </div>
                {draft.action === "max_qualifying" && (
                  <CheckCircle2Icon className="size-4 text-primary" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Limit Quantity</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Allow at most a specific number of matching dishes.
                </p>
              </div>
            </button>

            {/* Card 2: Disallow Completely */}
            <button
              type="button"
              role="radio"
              aria-checked={draft.action === "forbid"}
              onClick={() => set({ action: "forbid" })}
              className={cn(
                "group relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draft.action === "forbid"
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                  : "border-border/70 bg-card/60 hover:border-border hover:bg-card"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors",
                    draft.action === "forbid"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <BanIcon className="size-4" />
                </div>
                {draft.action === "forbid" && (
                  <CheckCircle2Icon className="size-4 text-primary" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Disallow Dishes</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Block matching dishes from being selected in this meal.
                </p>
              </div>
            </button>

            {/* Card 3: Cannot Combine (Mutually Exclusive) */}
            <button
              type="button"
              role="radio"
              aria-checked={draft.action === "cannot_coexist"}
              onClick={() => set({ action: "cannot_coexist" })}
              className={cn(
                "group relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draft.action === "cannot_coexist"
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                  : "border-border/70 bg-card/60 hover:border-border hover:bg-card"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors",
                    draft.action === "cannot_coexist"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <SplitIcon className="size-4" />
                </div>
                {draft.action === "cannot_coexist" && (
                  <CheckCircle2Icon className="size-4 text-primary" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Cannot Combine</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Mutually exclusive: cannot mix different matching dishes.
                </p>
              </div>
            </button>
          </div>

          {/* Dynamic Configuration & Contextual explanation based on selected action */}
          {draft.action === "max_qualifying" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background/80 p-3.5">
              <span className="text-sm font-medium text-foreground">Allow at most:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  aria-label="Maximum dishes"
                  className="w-20 bg-background text-center text-sm font-semibold"
                  value={draft.actionValue}
                  onChange={(e) => set({ actionValue: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">matching dish(es) in one meal</span>
              </div>
            </div>
          )}

          {draft.action === "forbid" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <BanIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <strong className="font-medium text-foreground">Completely blocked:</strong> Any dish matching the WHEN conditions cannot be chosen in this meal.
              </span>
            </div>
          )}

          {draft.action === "cannot_coexist" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <SplitIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong className="font-medium text-foreground">Mutually exclusive:</strong> Customers can choose from this pool, but cannot mix multiple different dishes (e.g. they can pick Dish A, or Dish B, but cannot select both Dish A and Dish B in the same meal).
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Customer Preview & Message Override */}
      <div className="space-y-3">
        <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <SparklesIcon className="size-3.5" />
            <span>Customer Preview</span>
          </div>
          <p className="text-pretty text-sm font-semibold text-foreground">
            &ldquo;{preview}&rdquo;
          </p>
          <p className="text-muted-foreground text-xs">
            Shown to customers in meal selection, and displayed if a choice violates this rule.
          </p>
        </div>

        <div className="grid gap-1.5 px-0.5">
          <Label htmlFor="rule-description" className="text-muted-foreground text-xs font-medium">
            Custom explanation override (optional)
          </Label>
          <Input
            id="rule-description"
            value={draft.description}
            placeholder="Leave blank to use the auto-generated sentence above"
            onChange={(e) => set({ description: e.target.value })}
            className="bg-background text-sm"
          />
        </div>
      </div>
    </div>
  );
}
