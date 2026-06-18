import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { Role } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import { encode as defaultEncode } from "next-auth/jwt";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database", maxAge: SESSION_MAX_AGE_S },
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
    // Tag credentials logins so jwt.encode can mint a DB session for them.
    async jwt({ token, account }) {
      if (account?.provider === "credentials") token.credentials = true;
      return token;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role: (typeof Role)[keyof typeof Role] }).role;
      }
      return session;
    },
  },
  jwt: {
    // Credential→DB-session bridge: persist a session row, return its token as the cookie.
    encode: async (params) => {
      if (params.token?.credentials) {
        const sessionToken = randomUUID();
        if (!params.token.sub) throw new Error("Missing user id in token");
        const created = await adapter.createSession?.({
          sessionToken,
          userId: params.token.sub,
          expires: new Date(Date.now() + SESSION_MAX_AGE_S * 1000),
        });
        if (!created) throw new Error("Failed to create DB session");
        return sessionToken;
      }
      return defaultEncode(params);
    },
  },
});
