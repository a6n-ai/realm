import { redirect } from "next/navigation";
import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { AuthLogo } from "@/components/auth/auth-kit";
import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title="No console access yet"
        tagline="Your account is signed in, but it hasn't been given access to the operations console. Ask an administrator to grant it."
      >
        <div className="flex flex-1 flex-col gap-5">
          <p className="text-[15px]">
            <span className="text-muted-foreground">Signed in as </span>
            <span className="font-medium [overflow-wrap:anywhere]">{session.user.email}</span>
          </p>
          <div className="pt-1">
            <SignOutButton />
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
