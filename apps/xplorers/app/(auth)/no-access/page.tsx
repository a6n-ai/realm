import { redirect } from "next/navigation";
import { Card, CardContent } from "@foundry/ui/card";
import { getSession } from "@/lib/auth/session";
import { SITE_NAME } from "@/lib/brand";
import { SignOutButton } from "./sign-out-button";

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
              Your account is signed in, but it has not been given access to the operations console. Ask an
              administrator to grant it.
            </p>
          </div>
          <div className="bg-muted rounded-md px-3 py-2 text-center text-sm">
            <span className="text-muted-foreground">Signed in as </span>
            <span className="font-medium break-all">{session.user.email}</span>
          </div>
          <SignOutButton />
        </div>
        <div className="bg-primary text-primary-foreground relative hidden flex-col items-center justify-center gap-2 border-l p-8 md:flex">
          <span className="text-2xl font-bold">{SITE_NAME}</span>
          <p className="text-balance text-center text-sm opacity-90">Operations console for staff.</p>
        </div>
      </CardContent>
    </Card>
  );
}
