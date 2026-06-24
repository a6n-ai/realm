import { Suspense } from "react";
import Link from "next/link";
import { LockIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  return (
    <Suspense>
      {session?.user ? (
        <Link
          href="/lock"
          className="bg-card text-card-foreground hover:bg-accent mb-4 flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium shadow-sm"
        >
          <LockIcon className="size-4" />
          Unlock with your PIN instead
        </Link>
      ) : null}
      <LoginForm />
    </Suspense>
  );
}
