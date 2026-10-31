"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/reui/stepper";
import type { Filter } from "@/components/reui/filters";
import { SectionCard } from "@/components/ds";
import { AccountSearch } from "./account-search";
import { FindStep } from "./steps/find-step";
import { ReviewStep, toCandidate } from "./steps/review-step";
import { CoinsStep } from "./steps/coins-step";
import { SummaryStep } from "./steps/summary-step";
import type { Candidate } from "./types";

const STEPS = ["Find", "Review", "Coins", "Summary"] as const;

export function GiveCoinsWizard({
  cities,
  maxRows,
  initialGroup,
}: {
  cities: string[];
  maxRows: number;
  initialGroup: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialGroup ? 4 : 1);
  const [filters, setFilters] = React.useState<Filter<string>[]>([]);
  const [payload, setPayload] = React.useState<Record<string, unknown>>({});
  const [rows, setRows] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [name, setName] = React.useState("");
  const [coins, setCoins] = React.useState("0");
  const [groupId, setGroupId] = React.useState<string | null>(initialGroup);
  const [listError, setListError] = React.useState<string | null>(null);

  const goCoins = () => {
    setName((n) => n || `Coins ${new Date().toLocaleDateString("en-CA")}`);
    setStep(3);
  };

  const reset = () => {
    setStep(1);
    setFilters([]);
    setPayload({});
    setRows([]);
    setSelected(new Set());
    setName("");
    setCoins("0");
    setGroupId(null);
    setListError(null);
    router.replace("/dashboard/wallet/give");
  };

  return (
    <SectionCard
      title="Give coins"
      subtitle="Find customers, review who is included, then give each of them coins. Running the same filters again pays again."
    >
      <div className="flex flex-col gap-6">
        <Stepper value={step} onValueChange={setStep} indicators={{ completed: <CheckIcon className="size-4" aria-hidden /> }}>
          <StepperNav>
            {STEPS.map((label, i) => (
              <StepperItem key={label} step={i + 1} completed={step > i + 1} disabled={i + 1 > step || step === 4} className="flex-1">
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

        {step === 3 && (
          <CoinsStep
            count={selected.size}
            name={name}
            onNameChange={setName}
            coins={coins}
            onCoinsChange={setCoins}
            filters={payload}
            userPublicIds={[...selected]}
            onBack={() => setStep(rows.length === 1 && "accountPublicId" in payload ? 1 : 2)}
            onSaved={({ publicId, listError: err }) => {
              setGroupId(publicId);
              setListError(err);
              setStep(4);
              router.push(`/dashboard/wallet/give?group=${publicId}`);
            }}
          />
        )}

        {step === 4 && groupId && <SummaryStep groupId={groupId} listError={listError} onReset={reset} />}
      </div>
    </SectionCard>
  );
}
