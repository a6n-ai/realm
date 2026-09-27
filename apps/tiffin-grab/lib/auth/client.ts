import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  // Email only — the server mounts no phone/username sign-in, so a client plugin for
  // either would just be a method that 404s.
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, useSession } = authClient;

// The wizard keeps the plan being built in this tab's sessionStorage (tiffin.wizard*).
// Without this, the next person to sign in on the same tab gets the previous customer's plan.
const WIZARD_DRAFT_PREFIX = "tiffin.wizard";

export const signOut: typeof authClient.signOut = (...args) => {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(WIZARD_DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch { /* storage unavailable */ }
  return authClient.signOut(...args);
};
