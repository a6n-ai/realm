import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, SkeletonFormCard } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { ChangeEmailForm } from "@/components/auth/change-email-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { GoogleConnectionField } from "@/components/auth/google-connection-field";
import { googleSignInEnabled } from "@foundry/auth";
import { hasGoogleLinked } from "@/lib/auth/google-link";

export default function AccountPage() {
  return (
    <PageShell>
      <PageHeader icon={UserIcon} title="Account" subtitle="Your profile and password." />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountData />
      </Suspense>
    </PageShell>
  );
}

async function AccountData() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const google = googleSignInEnabled() ? { connected: await hasGoogleLinked(session.user.id) } : null;

  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);

  return (
    <div className="grid max-w-2xl gap-4">
      <SectionCard title="Profile">
        <div className="grid gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-medium">{u?.name?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{session.user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <p className="font-medium capitalize">{session.user.role}</p>
          </div>
        </div>
      </SectionCard>
      {google ? (
        <SectionCard title="Google" subtitle="Sign in with your Google account instead of a code or password.">
          <GoogleConnectionField connected={google.connected} callbackURL="/dashboard/account" />
        </SectionCard>
      ) : null}
      <SectionCard title="Password" subtitle="Change your password. This signs you out on other devices.">
        <ChangePasswordForm />
      </SectionCard>
      <SectionCard
        title="Email"
        subtitle={`Change your email. We'll send a code to your current email (${session.user.email}) first, then a second code to the new address.`}
      >
        <ChangeEmailForm currentEmail={session.user.email} />
      </SectionCard>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonFormCard fields={2} />
      <SkeletonFormCard fields={2} />
    </div>
  );
}
