import Link from "next/link";
import { Button, Notice } from "@/components/customer/kit";

/** A second renewal would overlap the unpaid one and the customer could pay both. */
export function UnpaidRenewalNotice({ payPublicId }: { payPublicId: string | null }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Notice>You have a renewal waiting for payment</Notice>
      <div className="flex flex-wrap gap-2">
        <Link href={payPublicId ? `/me/pay/${payPublicId}` : "/me/deliveries"}>
          <Button variant="primary" size="lg">{payPublicId ? "Pay now" : "View my plan"}</Button>
        </Link>
        {!payPublicId && (
          <Link href="/me/renew?full=1">
            <Button variant="outline" size="lg">Build a different plan</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
