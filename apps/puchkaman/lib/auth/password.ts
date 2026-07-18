import { hashPassword, verifyPassword } from "@realm/auth";

export { hashPassword, verifyPassword };

export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
