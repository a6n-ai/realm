import { SectionCard, SkeletonPageHeader } from "@/components/ds";
import { FieldsSkeleton } from "../../_skeletons";

// Titles match PromotionForm's cards, in order.
const SECTIONS = ["Basics", "Where it shows", "Offer and button", "Schedule", "Card content (popup and landing section)", "Preview"];

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <SkeletonPageHeader subtitle />
      {SECTIONS.map((title) => (
        <SectionCard key={title} title={title}>
          <FieldsSkeleton fields={2} />
        </SectionCard>
      ))}
    </div>
  );
}
