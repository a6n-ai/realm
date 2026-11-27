import type { Column } from "@foundry/console/resource-table";
import type { InquiryRow } from "../../lib/inquiries/repository";
import { formatPhone, telHref } from "../../lib/phone";
import { LINK } from "../link-class";
import { FollowUpBadge } from "./follow-up-badge";
import { StageMenu } from "./stage-menu";

export const inquiryLabel = (r: Pick<InquiryRow, "contactName" | "companyName" | "id">): string => r.contactName ?? r.companyName ?? r.id;

const muted = <span className="text-muted-foreground">-</span>;

export const inquiryColumns = (canEdit: boolean): Column<InquiryRow>[] => [
  {
    header: "Contact",
    cell: (r) => (
      <span className="grid min-w-0 sm:max-w-64">
        <span className="font-medium sm:truncate text-(--strong)" title={r.contactName ?? r.companyName ?? undefined}>
          {r.contactName ?? r.companyName ?? "Unnamed"}
        </span>
        {r.contactName && r.companyName ? (
          <span className="text-muted-foreground sm:truncate" title={r.companyName}>
            {r.companyName}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    header: "Phone",
    secondary: true,
    cell: (r) =>
      r.phone ? (
        <a className={`whitespace-nowrap ${LINK}`} href={telHref(r.phone)}>
          {formatPhone(r.phone)}
        </a>
      ) : (
        muted
      ),
  },
  { header: "Stage", cell: (r) => <StageMenu id={r.id} stage={r.stage} canEdit={canEdit} /> },
  {
    header: "Owner",
    secondary: true,
    cell: (r) =>
      r.ownerName ? (
        <span className="block max-w-40 truncate" title={r.ownerName}>
          {r.ownerName}
          {r.ownerRemoved ? <span className="text-muted-foreground"> (removed)</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
  },
  { header: "Next follow-up", cell: (r) => <FollowUpBadge at={r.nextFollowUpAt} overdue={r.overdue} /> },
  {
    header: "Source",
    secondary: true,
    cell: (r) => (
      <span className="block max-w-32 truncate text-muted-foreground" title={r.source}>
        {r.source}
      </span>
    ),
  },
];
