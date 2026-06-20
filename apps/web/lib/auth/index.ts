import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { jwtCallback, sessionCallback } from "./callbacks";
import { resolveCredentialUser } from "./resolve-user";
import "./types";

// The adapter's table types insist on a string `users.id` (and string FKs),
// but our `users.id` is an internal bigint with a `next_id()` DB default. Under
// the JWT + Credentials strategy the adapter's id-keyed methods (getUser,
// getSessionAndUser, updateUser, …) are never invoked — auth flows entirely
// through `authorize`/`jwt`/`session` below — and `createUser` omits `id`
// because the column `hasDefault`. So the bigint is runtime-safe here; we cast
// the schema tables to the adapter's expected shape purely to satisfy its
// string-id typing. The internal bigint never reaches the token/session.
type AdapterSchema = Parameters<typeof DrizzleAdapter<typeof db>>[1];
const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
} as unknown as AdapterSchema);

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

// Auth.js v5 only supports the Credentials provider with the JWT session
// strategy (it hard-asserts UnsupportedStrategy under strategy:"database").
// This is the documented fallback from the plan: JWT sessions carrying the
// user id + role. The adapter is retained for user-table mapping.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
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
