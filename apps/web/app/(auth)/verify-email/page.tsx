import { Suspense } from "react";
import { VerifyStatus } from "./verify-status";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyStatus />
    </Suspense>
  );
}
