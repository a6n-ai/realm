import { eq } from "drizzle-orm";
import { UserIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/app/(dashboard)/dashboard/account/change-password-form";
import { ChangeEmailForm } from "@/app/(dashboard)/dashboard/account/change-email-form";
import { SetPasswordForm } from "@/components/customer/account/set-password-form";

export default async function CustomerAccountPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/account");

  const [u] = await db
    .select({ name: users.name, email: users.email, phone: users.phone, passwordSet: users.passwordSet })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");

  return (
    <PageShell>
      <PageHeader icon={UserIcon} title="Account" subtitle="Your details and how you sign in." />
      <SectionCard title="Details">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd>{u.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{u.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{u.phone ?? "—"}</dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard
        title="Sign-in"
        subtitle={
          u.passwordSet
            ? "You can sign in with a password or an emailed code."
            : "You sign in with an emailed code. Setting a password is optional."
        }
      >
        {u.passwordSet ? <ChangePasswordForm /> : <SetPasswordForm />}
      </SectionCard>
      {u.email ? (
        <SectionCard
          title="Email"
          subtitle={`We'll send a code to your current email (${u.email}) first, then a second code to the new address.`}
        >
          <ChangeEmailForm currentEmail={u.email} />
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
