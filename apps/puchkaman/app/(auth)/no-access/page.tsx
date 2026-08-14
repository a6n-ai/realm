import { redirect } from "next/navigation";
import { Card, CardContent } from "@realm/ui/card";
import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

// Terminal screen for a signed-in account no route group will admit — today
// that is `member`, which is invitable but has no /dashboard page yet. Lives
// under (auth) on purpose: (dashboard) and (customer) both redirect away.
export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="grid p-0 md:grid-cols-2">
        <div className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">No console access yet</h1>
            <p className="text-muted-foreground text-balance">
              Your account is signed in, but it has not been given access to the operations
              console. Ask an administrator to grant it.
            </p>
          </div>
          <div className="bg-muted rounded-md px-3 py-2 text-center text-sm">
            <span className="text-muted-foreground">Signed in as </span>
            <span className="font-medium break-all">{session.user.email}</span>
          </div>
          <SignOutButton />
        </div>
        <div className="relative hidden flex-col items-center justify-center gap-2 border-l border-[var(--green)] bg-[var(--yellow)] p-8 text-[var(--ink)] md:flex">
          <span className="text-2xl font-bold text-[var(--red)]">Puchkaman</span>
          <p className="text-balance text-center text-sm opacity-80">Operations console for staff.</p>
        </div>
      </CardContent>
    </Card>
  );
}
