import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { EmailSection } from "@/components/account/sections/email-section";
import { PasswordSection } from "@/components/account/sections/password-section";
import { DeleteAccountSection } from "@/components/account/sections/delete-account-section";

export default function MeSecurityPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<><EmailSection.Skeleton /><PasswordSection.Skeleton /></>}>
        <SecurityData />
      </Suspense>
      <DeleteAccountSection />
    </div>
  );
}

async function SecurityData() {
  const { user } = await requireAccountUser();
  return (
    <>
      <EmailSection currentEmail={user.email} />
      <PasswordSection />
    </>
  );
}
