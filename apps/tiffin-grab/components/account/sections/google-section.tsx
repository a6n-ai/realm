import { SectionCard } from "@/components/ds";
import { GoogleConnectionField } from "@/components/account/leaves/google-connection-field";

export function GoogleSection({ connected, titleAs }: { connected: boolean; titleAs?: "h2" | "h3" }) {
  return (
    <section id="google" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Google" subtitle="Sign in with your Google account instead of a code or password.">
        <GoogleConnectionField connected={connected} callbackURL="/dashboard/account/security" />
      </SectionCard>
    </section>
  );
}
