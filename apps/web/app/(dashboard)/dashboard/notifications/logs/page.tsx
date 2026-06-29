import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { eventLabel } from "@/components/notifications/template-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_STYLE: Record<string, string> = {
  sent: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  pending: "text-muted-foreground",
  processing: "text-amber-600 dark:text-amber-400",
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default async function NotificationLogsPage() {
  const rows = await db
    .select({
      publicId: notificationOutbox.publicId,
      event: notificationOutbox.event,
      channel: notificationOutbox.channel,
      status: notificationOutbox.status,
      attempts: notificationOutbox.attempts,
      providerMessageId: notificationOutbox.providerMessageId,
      lastError: notificationOutbox.lastError,
      createdAt: notificationOutbox.createdAt,
      email: users.email,
    })
    .from(notificationOutbox)
    .leftJoin(users, eq(users.id, notificationOutbox.recipientId))
    .orderBy(desc(notificationOutbox.createdAt))
    .limit(100);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        No notifications have been queued yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.publicId}>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
              <TableCell>{eventLabel(r.event)}</TableCell>
              <TableCell className="text-muted-foreground">{r.channel}</TableCell>
              <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
              <TableCell>
                <span className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}>{r.status}</span>
                {r.attempts > 1 && <span className="ml-1 text-xs text-muted-foreground">×{r.attempts}</span>}
              </TableCell>
              <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                {r.lastError ?? r.providerMessageId ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
