import { SectionCard } from "@foundry/design-system";
import { ChangeEmailForm } from "@/components/auth/change-email-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SetPasswordForm } from "@/components/customer/account/set-password-form";
import { GoogleConnectionField } from "@/components/auth/google-connection-field";

export function SecurityPanel({
  email,
  passwordSet,
  google,
}: {
  email: string | null;
  passwordSet: boolean;
  google: { connected: boolean } | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Security</h2>
        <p className="text-muted-foreground text-sm">How you sign in and keep your account safe.</p>
      </div>
      {google ? (
        <SectionCard title="Google" subtitle="Sign in with your Google account instead of a code or password.">
          <GoogleConnectionField connected={google.connected} callbackURL="/me/account?section=security" />
        </SectionCard>
      ) : null}
      <SectionCard
        title="Sign-in"
        subtitle={
          passwordSet
            ? "You can sign in with a password or an emailed code."
            : "You sign in with an emailed code. Setting a password is optional."
        }
      >
        {passwordSet ? <ChangePasswordForm /> : <SetPasswordForm />}
      </SectionCard>
      {email ? (
        <SectionCard
          title="Email"
          subtitle={`We'll send a code to your current email (${email}) first, then a second code to the new address.`}
        >
          <ChangeEmailForm currentEmail={email} />
        </SectionCard>
      ) : null}
    </div>
  );
}
