import { redirect } from "next/navigation";
import { LockIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { LockForm } from "./lock-form";

export default async function LockPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-md">
          <LockIcon className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Session locked</h1>
        <p className="text-muted-foreground text-sm">Enter your PIN to continue.</p>
      </div>
      <LockForm />
    </div>
  );
}
