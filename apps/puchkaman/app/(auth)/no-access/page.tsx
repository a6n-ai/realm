import { redirect } from "next/navigation";
import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { AuthLogo } from "@/components/auth/auth-kit";
import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "./sign-out-button";

// Terminal screen for a signed-in account whose role has nowhere to go —
// today no role lands here (admin/member reach /dashboard, everyone else
// /me), but it stays reachable for a future staff role with no pages yet.
// Lives under (auth): (dashboard) and (customer) both redirect away from it.
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
          <div className="mt-auto pt-4 sm:mt-2">
            <SignOutButton />
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
