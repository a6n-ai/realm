import { SectionCard } from "@/components/ds";
import { ChangePasswordForm } from "@/components/account/leaves/change-password-form";
import { SignOutButton } from "@/components/account/leaves/sign-out-button";

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
