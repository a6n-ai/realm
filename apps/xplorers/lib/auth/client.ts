import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { preventGoogleAutoSignIn } from "@foundry/auth-ui";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [emailOTPClient()],
});

export const { signIn, useSession } = authClient;

export const signOut: typeof authClient.signOut = (...args) => {
  // Else Google One Tap auto-select signs the user straight back in.
  void preventGoogleAutoSignIn();
  return authClient.signOut(...args);
};
