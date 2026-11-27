import type { Column } from "@foundry/console/resource-table";
import type { InquiryRow } from "../../lib/inquiries/repository";
import { FollowUpBadge } from "./follow-up-badge";
import { StageBadge } from "./stage-badge";

export const inquiryLabel = (r: Pick<InquiryRow, "contactName" | "companyName" | "id">): string => r.contactName ?? r.companyName ?? r.id;

export const inquiryColumns: Column<InquiryRow>[] = [
  {
    header: "Contact",
    cell: (r) => (
      <span className="grid">
        <span className="font-medium text-(--strong)">{r.contactName ?? r.companyName ?? "Unnamed"}</span>
        {r.contactName && r.companyName ? <span className="text-muted-foreground">{r.companyName}</span> : null}
      </span>
    ),
  },
  { header: "Stage", cell: (r) => <StageBadge stage={r.stage} /> },
  {
    header: "Owner",
    secondary: true,
    cell: (r) =>
      r.ownerName ? (
        <span>
          {r.ownerName}
          {r.ownerRemoved ? <span className="text-muted-foreground"> (removed)</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
  },
  { header: "Follow-up", cell: (r) => <FollowUpBadge at={r.nextFollowUpAt} overdue={r.overdue} /> },
];
