import type { ReactNode } from "react";
import { SectionCard } from "@/components/ds";
import { LabelDatePicker } from "../labels/label-date-picker";

export function DayHeader({
  date,
  today,
  basePath,
  actions,
}: {
  date: string;
  today: string;
  basePath: string;
  actions?: ReactNode;
}) {
  return (
    <SectionCard title="Day" variant="flat">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <LabelDatePicker date={date} today={today} basePath={basePath} />
        {actions}
      </div>
    </SectionCard>
  );
}
