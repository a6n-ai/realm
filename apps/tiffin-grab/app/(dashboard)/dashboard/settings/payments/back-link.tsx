import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export function PaymentsBackLink() {
  return (
    <Link
      href="/dashboard/settings/payments"
      prefetch={false}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeftIcon className="size-3.5" />
      Payment
    </Link>
  );
}
