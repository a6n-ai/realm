import { SectionCard } from "@/components/ds";
import { LabelDatePicker } from "../labels/label-date-picker";

export function DayHeader({
  date,
  today,
  basePath,
}: {
  date: string;
  today: string;
  basePath: string;
}) {
  return (
    <SectionCard title="Day" variant="flat">
      <LabelDatePicker date={date} today={today} basePath={basePath} />
    </SectionCard>
  );
}
