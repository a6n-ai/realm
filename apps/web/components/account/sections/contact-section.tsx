"use client";

import type { Country as CountryCode } from "react-phone-number-input";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "@/components/account/leaves/account-form";
import { ResendVerification } from "@/components/account/leaves/resend-verification";

export function ContactSection({
  phone,
  email,
  emailVerified,
  defaultCountry,
}: {
  phone: string;
  email: string;
  emailVerified: boolean;
  defaultCountry: CountryCode;
}) {
  return (
    <section id="contact" className="scroll-mt-24">
      <SectionCard title="Contact" subtitle="How we reach you for orders and account updates.">
        <div className="flex flex-col gap-4">
          <AccountForm phone={phone} email={email} defaultCountry={defaultCountry} />
          {email && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Email status:</span>
                {emailVerified ? (
                  <Badge variant="secondary">Verified</Badge>
                ) : (
                  <Badge variant="outline">Unverified</Badge>
                )}
              </div>
              {!emailVerified && <ResendVerification email={email} />}
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  );
}
