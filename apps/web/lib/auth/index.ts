import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { jwtCallback, sessionCallback } from "./callbacks";
import { resolveCredentialUser } from "./resolve-user";
import "./types";

// NextAuth DrizzleAdapter removed — BA tables (account/session/verification)
// now replace the old NextAuth accounts/sessions/verificationTokens tables.
// The adapter wiring moves to Better Auth in Task 3; this file is replaced then.

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

// Auth.js v5 only supports the Credentials provider with the JWT session
// strategy (it hard-asserts UnsupportedStrategy under strategy:"database").
// This is the documented fallback from the plan: JWT sessions carrying the
// user id + role. The adapter was retained for user-table mapping; removed
// with BA table migration — re-wired in Task 3.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Off-Vercel deploys (and proxied dev via ngrok/tunnels) must opt into
  // deriving the request host from X-Forwarded-Host/-Proto headers; otherwise
  // Auth.js v5 rejects any host that isn't localhost/AUTH_URL as untrusted.
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      authorize: async (raw) => {
        const user = await resolveCredentialUser(String(raw?.identifier ?? ""), String(raw?.password ?? ""));
        return user ?? null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      return jwtCallback({ token, user: user ?? undefined });
    },
    async session({ session, token }) {
      return sessionCallback({ session, token });
    },
  },
});
