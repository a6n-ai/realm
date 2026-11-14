import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/account/current-user";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { SetPasswordForm } from "./set-password-form";

// For accounts that have no password yet: provisioned customers landing here
// from the checkout verification link, and staff still on a seeded credential.
// Requires a session; anyone who already has a password of their own is bounced
// back so this no-current-password screen can never be replayed as a takeover.
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = await requireActiveUser(session.user.id);
  if (user.passwordSet && (await usersService.hasPassword(session.user.id))) redirect("/dashboard");
  return <SetPasswordForm />;
}
