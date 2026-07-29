import { createAuthClient } from "better-auth/react";
import { phoneNumberClient, usernameClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [phoneNumberClient(), usernameClient(), emailOTPClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
