import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  // Email only — the server mounts no phone/username sign-in, so a client plugin for
  // either would just be a method that 404s.
  plugins: [emailOTPClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
