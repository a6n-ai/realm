"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import type { Filter } from "@/components/reui/filters";
import { FindStep } from "./steps/find-step";
import { ReviewStep } from "./steps/review-step";
import { SaveStep } from "./steps/save-step";
import { createGroupAction } from "../actions";
import type { Candidate } from "./types";

const STEPS = ["Find", "Review", "Save"] as const;

export function NewGroupWizard({
  cities,
  maxRows,
  onSaved,
}: {
  cities: string[];
  maxRows: number;
  onSaved: (group: { publicId: string; count: number }) => void;
}) {
  const [step, setStep] = React.useState(1);
  const [filters, setFilters] = React.useState<Filter<string>[]>([]);
  const [payload, setPayload] = React.useState<Record<string, unknown>>({});
  const [rows, setRows] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (name: string) => {
    setSaving(true);
    setError(null);
    try {
      const { publicId } = await createGroupAction({ name, filters: payload, userPublicIds: [...selected] });
      onSaved({ publicId, count: selected.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the group");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Stepper value={step} onValueChange={setStep} indicators={{ completed: <CheckIcon className="size-4" aria-hidden /> }}>
        <StepperNav>
          {STEPS.map((label, i) => (
            <StepperItem key={label} step={i + 1} completed={step > i + 1} disabled={i + 1 > step} className="flex-1">
              <StepperTrigger className="gap-2">
                <StepperIndicator>{i + 1}</StepperIndicator>
                <StepperTitle>{label}</StepperTitle>
              </StepperTrigger>
              {i < STEPS.length - 1 && <StepperSeparator className="mx-2" />}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>

      {step === 1 && (
        <FindStep
          cities={cities}
          maxRows={maxRows}
          filters={filters}
          onFiltersChange={setFilters}
          onFound={(found, p) => {
            setRows(found);
            setSelected(new Set(found.map((r) => r.publicId)));
            setPayload(p);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <ReviewStep
          rows={rows}
          selected={selected}
          onSelectedChange={setSelected}
          onAdd={(c) => {
            setRows((r) => [c, ...r]);
            setSelected((s) => new Set(s).add(c.publicId));
          }}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <SaveStep count={selected.size} saving={saving} error={error} onBack={() => setStep(2)} onSave={save} />
      )}
    </div>
  );
}
