import { EmailSection } from "@/components/account/sections/email-section";
import { PasswordSection } from "@/components/account/sections/password-section";
import { DeleteAccountSection } from "@/components/account/sections/delete-account-section";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <EmailSection.Skeleton />
      <PasswordSection.Skeleton />
      <DeleteAccountSection />
    </div>
  );
}
