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
        const res = await authClient.unlinkAccount({ providerId: "google" });
        if (!res.error) router.refresh();
        return res;
      }}
    />
  );
}
