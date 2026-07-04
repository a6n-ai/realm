import { SectionCard } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";

const FIELDS = [
  { label: "Allergens", control: "select" },
  { label: "Dietary notes", control: "textarea" },
] as const;

export function DietarySectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="dietary" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Dietary & allergens"
        subtitle="Tell the kitchen what to avoid. Allergens are flagged on every order."
      >
        <div className="grid gap-4">
          {FIELDS.map((f) => (
            <div key={f.label} className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton
                className={f.control === "textarea" ? "h-20 w-full" : "h-9 w-full sm:w-72"}
              />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          ))}
          <div className="flex justify-end">
            <Skeleton className="h-9 w-full min-w-32 sm:w-32" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
