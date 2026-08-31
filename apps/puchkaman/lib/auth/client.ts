import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { orderTrackingClient } from "@foundry/order-tracking/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [emailOTPClient(), orderTrackingClient()],
});

export const { signIn, signOut, useSession } = authClient;
