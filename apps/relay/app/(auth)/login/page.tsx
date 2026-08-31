import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
