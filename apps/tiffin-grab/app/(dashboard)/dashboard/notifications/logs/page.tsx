import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { eventLabel } from "@/components/notifications/template-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";

const COLUMNS = [
  { key: "time", label: "Time" },
  { key: "event", label: "Event" },
  { key: "channel", label: "Channel" },
  { key: "recipient", label: "Recipient" },
  { key: "status", label: "Status" },
  { key: "detail", label: "Detail" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  sent: "text-ok",
  failed: "text-bad",
  pending: "text-muted-foreground",
  processing: "text-warn",
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

type LogRow = {
  publicId: string;
  event: string;
  channel: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: number;
  email: string | null;
};

function LogsTable({ rows }: { rows: LogRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key}>{c.label}</TableHead>
            ))}
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

LogsTable.Skeleton = function LogsTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={cn(c.key === "detail" && "max-w-[280px]")}>
                  <Skeleton className={cn("h-4", c.key === "detail" ? "w-full max-w-40" : "w-full max-w-32")} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default function NotificationLogsPage() {
  return (
    <Suspense fallback={<LogsTable.Skeleton />}>
      <LogsData />
    </Suspense>
  );
}

async function LogsData() {
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

  return <LogsTable rows={rows} />;
}
