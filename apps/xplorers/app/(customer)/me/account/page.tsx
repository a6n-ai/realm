import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Skeleton } from "@foundry/ui/skeleton";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { googleSignInEnabled } from "@foundry/auth";
import { hasGoogleLinked } from "@/lib/auth/google-link";
import { AccountPage } from "@/components/customer/account/account-page";
import { sectionFromSlug } from "@/components/customer/account/sections.config";
import { personalizationService } from "@/lib/services/personalization.service";

type SearchParams = Promise<{ section?: string }>;

export default function CustomerAccountRoute({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountData searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountData({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/account");

  const sp = await searchParams;
  const active = sectionFromSlug(sp.section);
  const google = googleSignInEnabled() ? { connected: await hasGoogleLinked(session.user.id) } : null;

  const [[u], personalization] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        image: users.image,
        passwordSet: users.passwordSet,
        displayUsername: users.displayUsername,
      })
      .from(users)
      .where(eq(users.publicId, session.user.id))
      .limit(1),
    personalizationService.listAnswersForUser(session.user.id),
  ]);
  if (!u) redirect("/login");

  return (
    <AccountPage
      user={{
        name: u.name,
        email: u.email,
        image: u.image,
        displayUsername: u.displayUsername,
        passwordSet: u.passwordSet,
      }}
      active={active}
      google={google}
      personalization={personalization}
    />
  );
}

function AccountSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
