import { Suspense } from "react";
import { Role } from "@realm/commons";
import { PasswordSection } from "@/components/account/sections/password-section";
import { PinSection } from "@/components/account/sections/pin-section";
import { EmailSection } from "@/components/account/sections/email-section";
import { DeleteAccountSection } from "@/components/account/sections/delete-account-section";
import { requireAccountUser } from "../current-user";

export default function AccountSecurityPage() {
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
  const { user, role } = await requireAccountUser();
  // PIN is staff-only (idle-lock). It is never rendered for a customer, so there
  // is no shared control that could leak it across roles.
  const isStaff = role === Role.ADMIN || role === Role.MEMBER;
  return (
    <>
      {isStaff && <PinSection hasPin={Boolean(user.pinHash)} />}
      <EmailSection currentEmail={user.email} />
      <PasswordSection />
    </>
  );
}
