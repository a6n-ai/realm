"use client";

import { useRouter } from "next/navigation";
import { DeleteAccountForm as SharedDeleteAccountForm, type AuthUi } from "@foundry/auth-ui";
import { deleteMyAccount } from "@/app/(dashboard)/dashboard/account/account-actions";

/** App wiring for the shared danger-zone delete form (soft-delete). */
export function DeleteAccountForm({ ui }: { ui?: Partial<AuthUi> }) {
  const router = useRouter();
  return (
    <SharedDeleteAccountForm
      ui={ui}
      onDelete={({ password }) => deleteMyAccount({ password })}
      onSuccess={() => {
        router.push("/");
        router.refresh();
      }}
    />
  );
}
