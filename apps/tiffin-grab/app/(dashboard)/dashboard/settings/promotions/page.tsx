import Link from "next/link";
import { MegaphoneIcon, PlusIcon } from "lucide-react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow, Table } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { EmptyState, PageHeader, SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { formatEpoch } from "@/lib/format/datetime";
import { promotionStatus, type PromotionStatus } from "@/lib/promotions/live";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { promotionsService } from "@/lib/services/promotions.service";
import { PromotionRowActions } from "./promotion-row-actions";
import { requestNow } from "@/lib/dates/request-now";

const STATUS: Record<PromotionStatus, { label: string; variant: "success-light" | "info-light" | "warning-light" | "invert-light" }> = {
  live: { label: "Live", variant: "success-light" },
  scheduled: { label: "Scheduled", variant: "info-light" },
  ended: { label: "Ended", variant: "warning-light" },
  off: { label: "Off", variant: "invert-light" },
};

export default async function PromotionsPage() {
  const [{ timezone }, rows] = await Promise.all([getAppSettings(), promotionsService.listAll()]);
  const now = requestNow();
  const day = (ms: number) => formatEpoch(ms, { mode: "date", timeZone: timezone });
  const windowOf = (s: number | null, e: number | null) =>
    s == null && e == null ? "Always" : `${s != null ? day(s) : "Now"} to ${e != null ? day(e) : "no end"}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={MegaphoneIcon}
        title="Promotions"
        subtitle="Hero sticker, popup and offers carousel on the home page."
        actions={<Button size="sm" asChild><Link href="/dashboard/settings/promotions/new"><PlusIcon /> New promotion</Link></Button>}
      />
      <SectionCard title="All promotions">
        {rows.length === 0 ? (
          <EmptyState
            icon={MegaphoneIcon}
            message="No promotions yet. Until you add one, the home page has no offers section or popup, and the hero sticker shows your best public coupon."
            action={<Button size="sm" asChild><Link href="/dashboard/settings/promotions/new">New promotion</Link></Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Shown in</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const s = STATUS[promotionStatus(p, now)];
                return (
                  <TableRow key={p.publicId}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" href={`/dashboard/settings/promotions/${p.publicId}`}>{p.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{p.placements.join(", ") || "-"}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{windowOf(p.startsAt, p.endsAt)}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell><PromotionRowActions publicId={p.publicId} title={p.title} active={p.active} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
