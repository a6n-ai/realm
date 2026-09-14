import { emailSchema, Role, ValidationError, type RoleValue } from "@foundry/commons";
import { auth } from "@/lib/auth";
import { usersService } from "./users.service";

export type InviteDeps = {
  createUser: (input: { email: string; name: string; role: RoleValue }) => Promise<{ publicId: string; email: string }>;
  markPasswordUnset: (publicId: string) => Promise<void>;
  sendResetOtp: (email: string) => Promise<void>;
};

const liveDeps: InviteDeps = {
  createUser: async ({ email, name, role }) => {
    const res = await auth.api.createUser({ body: { email, name, role: role as "admin" | "member" } });
    const created = res.user as { id: string; publicId?: string; email: string };
    if (!created.publicId) throw new Error("createUser returned no publicId");
    return { publicId: created.publicId, email: created.email };
  },
  markPasswordUnset: async (publicId) => {
    await usersService.markPasswordUnset(publicId);
  },
  sendResetOtp: async (email) => {
    await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
  },
};

export async function inviteUser(
  input: { email: string; name: string; role: RoleValue },
  deps: InviteDeps = liveDeps,
): Promise<{ publicId: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new ValidationError("Enter a valid email");

  const name = input.name.trim();
  if (name === "") throw new ValidationError("Name is required");
  if (name.length > 120) throw new ValidationError("Name is too long");

  if (input.role !== Role.ADMIN && input.role !== Role.MEMBER) {
    throw new ValidationError("Unknown role");
  }

  let created: { publicId: string; email: string };
  try {
    created = await deps.createUser({ email: parsed.data, name, role: input.role });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/already exists/i.test(msg)) throw new ValidationError("That email is already in use");
    throw e;
  }

  await deps.markPasswordUnset(created.publicId);

  try {
    await deps.sendResetOtp(created.email);
  } catch {
    throw new ValidationError(
      "Account created, but the invite email could not be sent. Use Send password reset on their row to retry.",
    );
  }

  return created;
}
