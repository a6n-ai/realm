import type { RoleValue } from "@tiffin/commons";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: RoleValue } & DefaultSession["user"];
  }
  interface User {
    role: RoleValue;
  }
}
