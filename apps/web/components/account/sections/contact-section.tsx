import type { Country as CountryCode } from "react-phone-number-input";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/account/leaves/account-form";
import { ResendVerification } from "@/components/account/leaves/resend-verification";

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">Verified</Badge>
  ) : (
    <Badge variant="outline">Unverified</Badge>
  );
}

export function ContactSection({
  phone,
  email,
  emailVerified,
  phoneVerified,
  defaultCountry,
  titleAs,
}: {
  phone: string;
  email: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  defaultCountry: CountryCode;
  titleAs?: "h2" | "h3";
}) {
  return (
    <section id="contact" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Contact" subtitle="How we reach you for orders and account updates.">
        <div className="flex flex-col gap-4">
          <AccountForm phone={phone} email={email} defaultCountry={defaultCountry} />
          {(phone || email) && (
            <dl className="flex flex-col gap-2 border-t pt-4">
              {phone && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground text-sm">Phone</dt>
                  <dd>
                    <VerificationBadge verified={phoneVerified} />
                  </dd>
                </div>
              )}
              {email && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground text-sm">Email</dt>
                  <dd className="flex items-center gap-2">
                    {!emailVerified && <ResendVerification email={email} />}
                    <VerificationBadge verified={emailVerified} />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </SectionCard>
    </section>
  );
}
