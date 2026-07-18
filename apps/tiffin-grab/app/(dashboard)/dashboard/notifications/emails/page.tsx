import { Suspense } from "react";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { emailLog, notificationPrefs } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";
import { SectionCard } from "@/components/ds";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@realm/ui/table";

export default function EmailsPage() {
  return (
    <Suspense fallback={<EmailsSkeleton />}>
      <EmailsData />
    </Suspense>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "bad" && value > 0 ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

async function EmailsData() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const n = sql<number>`cast(count(*) as int)`;

  const [{ timezone }, sent24, failed24, totalSent, suppressed, rows] = await Promise.all([
    getAppSettings(),
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "sent"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "failed"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(eq(emailLog.status, "sent")),
    db.select({ n }).from(notificationPrefs).where(and(eq(notificationPrefs.channel, "email"), eq(notificationPrefs.suppressed, true))),
    db
      .select({
        publicId: emailLog.publicId,
        recipient: emailLog.recipient,
        subject: emailLog.subject,
        status: emailLog.status,
        messageId: emailLog.providerMessageId,
        error: emailLog.error,
        createdAt: emailLog.createdAt,
      })
      .from(emailLog)
      .orderBy(desc(emailLog.createdAt))
      .limit(100),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sent (24h)" value={sent24[0]?.n ?? 0} />
        <Tile label="Failed (24h)" value={failed24[0]?.n ?? 0} tone="bad" />
        <Tile label="Total sent" value={totalSent[0]?.n ?? 0} />
        <Tile label="Suppressed" value={suppressed[0]?.n ?? 0} tone="bad" />
      </div>

      <SectionCard title="Recent emails" subtitle="Every send — auth and notification — newest first.">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No emails sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.publicId}>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {formatEpoch(r.createdAt, { mode: "datetime", timeZone: timezone })}
                    </TableCell>
                    <TableCell className="text-sm">{r.recipient}</TableCell>
                    <TableCell className="text-sm">
                      {r.subject}
                      {r.error && <span className="text-destructive block text-xs">{r.error}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "sent" ? "secondary" : "outline"}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function EmailsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <SectionCard title="Recent emails">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
