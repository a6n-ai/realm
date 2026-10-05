import { TicketPercentIcon } from "lucide-react";
import { PageHeader } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/guards";
import { DiscountsTabs } from "./discounts-tabs";

/** Shared by /dashboard/discounts/* and /dashboard/catalog/discounts so both read as one area. */
export function DiscountsHeader() {
  return (
    <>
      <PageHeader icon={TicketPercentIcon} title="Discounts" />
      <DiscountsTabs />
    </>
  );
}

export async function canEditDiscounts(): Promise<boolean> {
  const session = await getSession();
  return session?.user ? roleCan(session.user.role, { discount: ["update"] }) : false;
}
