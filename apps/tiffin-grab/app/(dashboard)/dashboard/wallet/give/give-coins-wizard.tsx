"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import type { Filter } from "@/components/reui/filters";
import { SectionCard } from "@/components/ds";
import { AccountSearch } from "./account-search";
import { FindStep } from "./steps/find-step";
import { ReviewStep, toCandidate } from "./steps/review-step";
import type { Candidate } from "./types";

const STEPS = ["Find", "Review"] as const;

export function GiveCoinsWizard({
  cities,
  maxRows,
  initialGroup: _initialGroup,
}: {
  cities: string[];
  maxRows: number;
  initialGroup: string | null;
}) {
  const [step, setStep] = React.useState(1);
  const [filters, setFilters] = React.useState<Filter<string>[]>([]);
  const [, setPayload] = React.useState<Record<string, unknown>>({});
  const [rows, setRows] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Task 3 replaces this wizard with the customer-groups flow; the coins/summary steps are gone until then.
  const goCoins = () => setStep(2);

  return (
    <SectionCard
      title="Give coins"
      subtitle="Find customers, review who is included, then give each of them coins. Running the same filters again pays again."
    >
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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">One customer</p>
              <AccountSearch
                placeholder="Name, phone or email"
                onPick={(a) => {
                  setRows([toCandidate(a)]);
                  setSelected(new Set([a.publicId]));
                  setPayload({ accountPublicId: a.publicId });
                  goCoins();
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Or a group of customers</p>
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
            </div>
          </div>
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
            onNext={goCoins}
          />
        )}
      </div>
    </SectionCard>
  );
}
