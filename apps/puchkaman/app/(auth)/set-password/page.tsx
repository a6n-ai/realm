import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { SetPasswordForm } from "./set-password-form";

// Reached only mid-first-login: the /dashboard gate sends accounts still on
// their default password here. Requires a session; anyone who has already set a
// password is bounced back to the app so this forced screen can't be re-run.
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const [u] = await db
    .select({ passwordSet: users.passwordSet })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
  if (u.passwordSet) redirect("/dashboard");

  return <SetPasswordForm />;
}
