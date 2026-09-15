import { SectionCard } from "@/components/ds";
import { LabelDatePicker } from "../labels/label-date-picker";

export function DayHeader({ date, today }: { date: string; today: string }) {
  return (
    <SectionCard title="Day" variant="flat">
      <LabelDatePicker date={date} today={today} basePath="/dashboard/dispatch" />
    </SectionCard>
  );
}
