import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export default function ResetPasswordPage() {
  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
