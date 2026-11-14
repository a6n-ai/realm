import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { preventGoogleAutoSignIn } from "@foundry/auth-ui";
import { getCaptchaToken, needsCaptcha } from "./captcha-client";
import { publicAuthUrl } from "@/lib/runtime/env.public";
import { wizardSession } from "@/lib/wizard/session";

export const authClient = createAuthClient({
  baseURL: publicAuthUrl(),
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

export const signOut: typeof authClient.signOut = (...args) => {
  // Without this, the next person to sign in on the same tab gets the previous customer's plan, postal code and quote codes.
  wizardSession.clearAll();
  wizardSession.clearPostal();
  // Else Google One Tap auto-select signs the user straight back in.
  void preventGoogleAutoSignIn();
  return authClient.signOut(...args);
};
