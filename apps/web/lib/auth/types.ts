import type { RoleValue } from "@tiffin/commons";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: RoleValue } & DefaultSession["user"];
  }
  interface User {
    // `id` and `publicId` are both the public id (`usr_…`); the internal bigint
    // never enters the Auth.js user object.
    publicId?: string;
    role: RoleValue;
  }
}
