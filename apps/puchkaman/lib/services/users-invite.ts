import { emailSchema, Role, ValidationError, type RoleValue } from "@realm/commons";
import { auth } from "@/lib/auth";
import { usersService } from "./users.service";

export type InviteDeps = {
  createUser: (input: { email: string; name: string; role: RoleValue }) => Promise<{ publicId: string; email: string }>;
  markPasswordUnset: (publicId: string) => Promise<void>;
  sendResetOtp: (email: string) => Promise<void>;
};

// The real collaborators. Split out so the orchestration above can be unit-tested
// without a database or SES; the app always uses these.
const liveDeps: InviteDeps = {
  createUser: async ({ email, name, role }) => {
    // No `password` field on purpose. The admin plugin treats it as optional and, when
    // absent, creates the user with NO credential account at all — so there is no
    // password to generate, hash, or leak. /email-otp/reset-password creates the
    // credential when the invitee sets one.
    // inviteUser has already rejected anything but ADMIN/MEMBER before this runs;
    // the admin plugin's own type just doesn't know that RoleValue is narrower here.
    const res = await auth.api.createUser({ body: { email, name, role: role as "admin" | "member" } });
    const created = res.user as { id: string; publicId?: string; email: string };
    if (!created.publicId) throw new Error("createUser returned no publicId");
    return { publicId: created.publicId, email: created.email };
  },
  markPasswordUnset: async (publicId) => {
    // passwordSet is not a better-auth field, so no plugin endpoint can write it.
    // False routes the invitee through /set-password if they reach the dashboard
    // before choosing a password.
    await usersService.update(publicId, { passwordSet: false });
  },
  sendResetOtp: async (email) => {
    await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
  },
};

/**
 * Create a staff account and mail its owner a code to set their own password.
 *
 * No password is ever issued, displayed, or transmitted: the account exists with no
 * credential until the invitee completes the OTP reset, which also flips emailVerified.
 */
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
    // The account is real and usable — an admin can retry from the row's "Send
    // password reset" action. Rolling it back would silently discard their work over
    // a transient mail failure.
    throw new ValidationError(
      "Account created, but the invite email could not be sent. Use Send password reset on their row to retry.",
    );
  }

  return created;
}
