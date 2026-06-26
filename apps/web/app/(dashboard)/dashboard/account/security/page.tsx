import { Role } from "@tiffin/commons";
import { PasswordSection } from "@/components/account/sections/password-section";
import { PinSection } from "@/components/account/sections/pin-section";
import { requireAccountUser } from "../current-user";

export default async function AccountSecurityPage() {
  const { user, role } = await requireAccountUser();
  // PIN is staff-only (idle-lock). It is never rendered for a customer, so there
  // is no shared control that could leak it across roles.
  const isStaff = role === Role.ADMIN || role === Role.MEMBER;
  return (
    <div className="space-y-5">
      {isStaff && <PinSection hasPin={Boolean(user.pinHash)} />}
      <PasswordSection />
    </div>
  );
}
