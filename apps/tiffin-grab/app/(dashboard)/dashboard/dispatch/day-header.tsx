import type { ReactNode } from "react";
import { LabelDatePicker } from "../labels/label-date-picker";
import { DispatchTabs } from "./dispatch-tabs";

// A bare filter row like the Orders page: tabs left, date and actions right, no card around it.
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <DispatchTabs date={date} />
      <div className="flex flex-wrap items-center gap-2">
        <LabelDatePicker date={date} today={today} basePath={basePath} />
        {actions}
      </div>
    </div>
  );
}
