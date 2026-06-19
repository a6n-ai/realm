import { redirect } from "next/navigation";
import { UserCircleIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await usersService.read(session.user.id);

  return (
    <section className="space-y-6">
      <div className="group flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
          <UserCircleIcon className="icon-pop size-5" />
        </span>
        <h1 className="gradient-text text-2xl font-semibold">Account</h1>
      </div>
      <p className="text-muted-foreground text-sm">Update your contact details. Phone and email must be unique.</p>
      <AccountForm phone={user.phone ?? ""} email={user.email ?? ""} />
    </section>
  );
}
