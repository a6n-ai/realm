import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await usersService.read(session.user.id);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="text-muted-foreground text-sm">Update your contact details. Phone and email must be unique.</p>
      <AccountForm phone={user.phone ?? ""} email={user.email ?? ""} />
    </section>
  );
}
