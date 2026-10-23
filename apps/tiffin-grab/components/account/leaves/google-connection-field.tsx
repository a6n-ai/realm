"use client";

import { useRouter } from "next/navigation";
import { GoogleConnection } from "@foundry/auth-ui";
import type { AuthUi } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";

/** Connect / disconnect Google for the signed-in user; `callbackURL` is where Google returns after linking. */
export function GoogleConnectionField({
  connected,
  callbackURL,
  ui,
}: {
  connected: boolean;
  callbackURL: string;
  ui?: Partial<AuthUi>;
}) {
  const router = useRouter();
  return (
    <GoogleConnection
      connected={connected}
      ui={ui}
      // Linking only accepts a Google account with this account's email (Better Auth default).
      onConnect={() => authClient.linkSocial({ provider: "google", callbackURL })}
      onDisconnect={async () => {
        // Better Auth 1.7 unlinks by account row id, not provider.
        const list = await authClient.listAccounts();
        if (list.error) return list;
        const google = list.data.find((a) => a.providerId === "google");
        if (!google) return { error: { message: "No Google account is linked." } };
        const res = await authClient.unlinkAccount({ accountId: google.id });
        if (!res.error) router.refresh();
        return res;
      }}
    />
  );
}
