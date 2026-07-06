import { redirect } from "next/navigation";
import { NotFoundError } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { SetPasswordForm } from "./set-password-form";

// Reached only mid-first-login: the /dashboard gate sends accounts still on
// their default password here. Requires a session; anyone who has already set a
// password is bounced back to the app so this forced screen can't be re-run.
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  try {
    const user = await usersService.read(session.user.id);
    if (user.passwordSet) redirect("/dashboard");
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  return <SetPasswordForm />;
}
