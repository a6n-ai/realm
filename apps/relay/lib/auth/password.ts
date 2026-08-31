import { hashPassword, verifyPassword } from "@foundry/auth";

export { hashPassword, verifyPassword };

export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
