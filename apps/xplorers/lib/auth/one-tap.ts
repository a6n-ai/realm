"use client";

import { createAuthClient } from "better-auth/react";
import { oneTapClient } from "better-auth/client/plugins";

// Google One Tap, sign-in only (server: googleOneTapPlugins). Its own client
// because the Client ID arrives from the server as a prop: no NEXT_PUBLIC_
// build arg to plumb through the Dockerfile. autoSelect signs a returning
// user in without a tap; Chrome spaces those out by 10 minutes, and signOut
// clears it (lib/auth/client.ts) so sign-out never loops back in.
export function promptGoogleOneTap(clientId: string, handlers: { onSignedIn: () => void; onRefused?: () => void }) {
  const client = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    // maxAttempts 1: one prompt per visit, no re-prompting after a dismiss.
    plugins: [oneTapClient({ clientId, autoSelect: true, context: "signin", promptOptions: { maxAttempts: 1 } })],
  });
  return client.oneTap({ fetchOptions: { onSuccess: handlers.onSignedIn, onError: () => handlers.onRefused?.() } });
}
