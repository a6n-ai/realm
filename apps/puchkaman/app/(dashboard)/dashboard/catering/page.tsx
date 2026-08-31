import { CalendarHeartIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { listCateringInquiries } from "@/lib/services/catering.service";

const shopDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export default async function CateringPage() {
  await requirePermission({ order: ["read"] });
  const rows = await listCateringInquiries();

  return (
    <PageShell>
      <PageHeader
        icon={CalendarHeartIcon}
        title="Catering"
        subtitle="Quote requests submitted from the public catering page."
      />
      <SectionCard title="Requests" subtitle={`${rows.length} total, newest first.`}>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No catering requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Event date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.publicId}>
                    <TableCell className="whitespace-nowrap">{shopDate(r.createdAt)}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{r.phone}</div>
                      <div className="text-muted-foreground text-xs">{r.email}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.eventDate}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>{r.guests}</TableCell>
                    <TableCell>{r.eventType}</TableCell>
                    <TableCell className="max-w-xs truncate" title={[r.allergies, r.message].filter(Boolean).join(" — ")}>
                      {[r.allergies, r.message].filter(Boolean).join(" — ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
