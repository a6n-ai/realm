import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { UserIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader, PageShell, SectionCard, SkeletonFormCard } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { ChangeEmailForm } from "@/components/auth/change-email-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SetPasswordForm } from "@/components/customer/account/set-password-form";

export default function CustomerAccountPage() {
  return (
    <PageShell>
      <PageHeader icon={UserIcon} title="Account" subtitle="Your details and how you sign in." />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountData />
      </Suspense>
    </PageShell>
  );
}

async function AccountData() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/account");

  const [u] = await db
    .select({ name: users.name, email: users.email, passwordSet: users.passwordSet })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");

  return (
    <>
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
    </>
  );
}

function AccountSkeleton() {
  return (
    <>
      <div className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="grid gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonFormCard fields={2} />
      <SkeletonFormCard fields={2} />
    </>
  );
}
