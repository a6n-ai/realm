import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { Role, type RoleValue } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { verifyPassword } from "./password";
import "./types";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

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
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const email = String(raw?.email ?? "").toLowerCase().trim();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user?.passwordHash) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role ?? Role.USER };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: RoleValue }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? session.user.id;
        session.user.role = (token.role as RoleValue | undefined) ?? session.user.role;
      }
      return session;
    },
  },
});
