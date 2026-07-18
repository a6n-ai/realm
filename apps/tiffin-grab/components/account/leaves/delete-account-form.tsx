"use client";

import { useRouter } from "next/navigation";
import { DeleteAccountForm as SharedDeleteAccountForm } from "@realm/auth-ui";
import { deleteMyAccount } from "@/app/(dashboard)/dashboard/account/account-actions";

/** App wiring for the shared danger-zone delete form (soft-delete). */
export function DeleteAccountForm() {
  const router = useRouter();
  return (
    <SharedDeleteAccountForm
      onDelete={({ password }) => deleteMyAccount({ password })}
      onSuccess={() => {
        router.push("/");
        router.refresh();
      }}
    />
  );
}
