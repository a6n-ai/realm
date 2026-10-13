import Link from "next/link";
import { CalendarOffIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { humanDate } from "@/lib/deliveries-view";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listDeclarableOrganizations, listHolidays, listNeedsPlacing, type NeedsPlacingRow } from "@/lib/services/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { HolidayDialog } from "./holiday-dialog";
import { HolidayRowActions } from "./holiday-row-actions";
import { PlaceForm } from "./place-form";

const reasonFor = (w: NeedsPlacingRow) =>
  w.trial ? "Trial: never placed automatically." : w.held ? "On hold when the holiday was set." : "No free day, or another plan is in the way.";

export default async function HolidaysPage() {
  await requirePermission({ holiday: ["read"] });
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [{ timezone }, rows, waiting, organizations] = await Promise.all([
    getAppSettings(), listHolidays(visible), listNeedsPlacing(visible), listDeclarableOrganizations(visible),
  ]);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const waitingBy = new Map<string, number>();
  for (const w of waiting) waitingBy.set(w.holidayPublicId, (waitingBy.get(w.holidayPublicId) ?? 0) + 1);

  return (
    <PageShell>
      <PageHeader
        icon={CalendarOffIcon}
        title="Holidays"
        subtitle="Days the kitchen is closed."
        actions={<HolidayDialog today={today} organizations={organizations} />}
      />
      {waiting.length > 0 && (
        <SectionCard title="Needs placing">
          <p className="text-muted-foreground mb-3 text-sm">
            These closed days have no extra day yet. Pick the first day and the tiffins go on that plan&apos;s next free delivery days.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closed day</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Tiffins</TableHead>
                <TableHead>Why</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiting.map((w) => (
                <TableRow key={w.deliveryPublicId}>
                  <TableCell>{humanDate(w.date)} · {w.holidayName}</TableCell>
                  <TableCell><Link className="underline" href={`/dashboard/orders/${w.orderPublicId}`}>{w.orderCode}</Link></TableCell>
                  <TableCell>{w.customerName}</TableCell>
                  <TableCell className="text-right">{w.tiffins}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{reasonFor(w)}</TableCell>
                  <TableCell><PlaceForm deliveryPublicId={w.deliveryPublicId} today={today} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}
      <SectionCard title="Holidays">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No holidays yet. Declare one and every delivery on that day is paused and added back at the end of its plan.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="text-right">Deliveries closed</TableHead>
                <TableHead className="text-right">Needs placing</TableHead>
                <TableHead>Declared by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.publicId}>
                  <TableCell>{humanDate(r.date)}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.organizationName}</TableCell>
                  <TableCell className="text-right">{r.closed}</TableCell>
                  <TableCell className="text-right">{waitingBy.get(r.publicId) ?? 0}</TableCell>
                  <TableCell>{r.declaredBy ?? "-"}</TableCell>
                  <TableCell>
                    <HolidayRowActions publicId={r.publicId} name={r.name} canReapply={r.date >= today} canRemove={r.date > today} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </PageShell>
  );
}
