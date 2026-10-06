import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { preventGoogleAutoSignIn } from "@foundry/auth-ui";
import { getCaptchaToken, needsCaptcha } from "./captcha-client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  // Email only — the server mounts no phone/username sign-in, so a client plugin for
  // either would just be a method that 404s.
  plugins: [emailOTPClient()],
  fetchOptions: {
    // Turnstile token on every request that mails a code or checks a password
    // (lib/auth/captcha.ts) — one place, so no form can forget it.
    onRequest: async (context) => {
      if (!needsCaptcha(context.url)) return;
      const token = await getCaptchaToken();
      if (token) context.headers.set("x-captcha-response", token);
      return context;
    },
  },
});

export const { signIn, signUp, useSession } = authClient;

// The wizard keeps the plan being built in this tab's sessionStorage (tiffin.wizard*).
// Without this, the next person to sign in on the same tab gets the previous customer's plan.
const WIZARD_DRAFT_PREFIX = "tiffin.wizard";

export const signOut: typeof authClient.signOut = (...args) => {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(WIZARD_DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch { /* storage unavailable */ }
  // Else Google One Tap auto-select signs the user straight back in.
  void preventGoogleAutoSignIn();
  return authClient.signOut(...args);
};
