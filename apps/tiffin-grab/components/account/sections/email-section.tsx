import { SectionCard } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { ChangeEmailForm } from "@/components/account/leaves/change-email-form";

export function EmailSection({ currentEmail, titleAs }: { currentEmail?: string | null; titleAs?: "h2" | "h3" }) {
  return (
    <section id="email" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Email address"
        subtitle="Change the email used for sign-in and account notices. We verify both your current and new address."
      >
        <ChangeEmailForm currentEmail={currentEmail} />
      </SectionCard>
    </section>
  );
}

EmailSection.Skeleton = function EmailSectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="email" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Email address" subtitle="Change the email used for sign-in and account notices.">
        <div className="grid max-w-md gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      </SectionCard>
    </section>
  );
};
