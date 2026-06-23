import { Suspense } from "react";
import { VerifyStatus } from "./verify-status";

export default function VerifyEmailPage() {
  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <Suspense>
          <VerifyStatus />
        </Suspense>
      </div>
    </main>
  );
}
