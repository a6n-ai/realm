import Link from "next/link";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";

export type BookingListItem = {
  publicId: string;
  sessionTitle: string;
  startsAt: Date;
  seats: number;
  status: string;
  paymentPublicId: string | null;
};

export function BookingRow({
  booking,
  timeZone,
}: {
  booking: BookingListItem;
  timeZone: string;
}) {
  return (
    <li className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold tracking-tight">{booking.sessionTitle}</p>
        <p className="text-muted-foreground text-sm">
          {formatSessionDay(booking.startsAt, timeZone)} · {formatSessionTime(booking.startsAt, timeZone)} ·{" "}
          {booking.seats} {booking.seats === 1 ? "seat" : "seats"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={booking.status === "confirmed" ? "default" : "outline"} className="capitalize">
          {booking.status}
        </Badge>
        {booking.status === "pending" && booking.paymentPublicId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/me/pay/${booking.paymentPublicId}`}>Pay</Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
