import { SectionCard } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { ChangePasswordForm } from "@/components/account/leaves/change-password-form";
import { SignOutButton } from "@/components/account/leaves/sign-out-button";

// Source of truth for the change-password fields; the real form and the
// .Skeleton twin enumerate the same three fields.
const PASSWORD_FIELDS = ["Current password", "New password", "Confirm new password"];

export function PasswordSection({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="password" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Password" subtitle="Change your password or sign out of this device.">
        <div className="flex flex-col gap-6">
          <ChangePasswordForm />
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Sign out of your account on this device.
            </p>
            <SignOutButton />
          </div>
        </div>
      </SectionCard>
    </section>
  );
}

PasswordSection.Skeleton = function PasswordSectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="password" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Password" subtitle="Change your password or sign out of this device.">
        <div className="flex flex-col gap-6">
          <div className="grid max-w-md gap-3">
            {PASSWORD_FIELDS.map((label) => (
              <div key={label} className="grid gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
};
