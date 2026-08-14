import Link from "next/link";
import { Badge } from "@realm/ui/badge";
import type { MyOrderSummary } from "@/lib/customers/my-orders";

const money = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(d);

export function OrderSummaryList({ orders }: { orders: MyOrderSummary[] }) {
  return (
    <ul className="divide-border divide-y">
      {orders.map((order) => (
        <li key={order.publicId}>
          <Link
            href={`/me/orders/${order.publicId}`}
            className="hover:bg-accent/50 flex items-center justify-between gap-4 px-2 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{order.reference}</p>
              <p className="text-muted-foreground text-sm">
                {day(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge variant={order.ongoing ? "default" : "secondary"}>{order.status}</Badge>
              <span className="tabular-nums">{money(order.total)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
