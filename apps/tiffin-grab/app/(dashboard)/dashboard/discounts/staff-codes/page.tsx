import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { couponStatus } from "@/lib/coupons/status";
import { Suspense } from "react";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { withListDates } from "@/lib/list/default-month";
import { StaffCodes, StaffCodesSkeleton, type IssuedCode } from "./staff-codes";
import { requestNow } from "@/lib/dates/request-now";
import { getMoneyFormatter } from "@/lib/settings";
import { listCodeIssuers, listStaffCodes, STAFF_CODE_SORT_COLUMNS, type StaffCodeKind, type StaffCodeSortColumn } from "@/lib/coupons/staff-codes.service";

const TYPE_OPTIONS = [
  { value: "rep_code", label: "Staff code" },
  { value: "rep_daily", label: "Daily coupon" },
];
const STATUS_OPTIONS = [
  { value: "unused", label: "Open" },
  { value: "used", label: "Used up" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function StaffCodesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffCodesSkeleton />}>
      <StaffCodesData searchParams={searchParams} />
    </Suspense>
  );
}

async function StaffCodesData({ searchParams }: { searchParams: SearchParams }) {
  const usd = await getMoneyFormatter();
  const sp = await withListDates(await searchParams);
  const sort: SortState<StaffCodeSortColumn> = parseSort(sp, STAFF_CODE_SORT_COLUMNS, { column: "created", dir: "desc" });
  const now = requestNow();

  const staff = await listCodeIssuers();

  const spec: FacetDef[] = [
    { kind: "select", field: "type", label: "Type", options: TYPE_OPTIONS },
    { kind: "select", field: "status", label: "Status", options: STATUS_OPTIONS },
    { kind: "select", field: "issuer", label: "Issued by", options: staff.map((s) => ({ value: s.publicId, label: s.name ?? s.email ?? s.publicId })) },
    { kind: "search", fields: ["code", "issuer", "customer", "order"] },
  ];
  const { page } = parseFilterState(spec, sp);

  const type = TYPE_OPTIONS.find((t) => t.value === sp.type)?.value as StaffCodeKind | undefined;
  const { rows, agg, total } = await listStaffCodes({
    now,
    dates: sp,
    type,
    issuer: sp.issuer,
    q: sp.q,
    status: sp.status,
    sort,
    size: page.size,
    offset: pageOffset(page.page, page.size),
  });

  const codes: IssuedCode[] = rows.map((c) => {
    const count = c.uses ?? 0;
    const maxUses = c.maxUses ?? 1;
    return {
      publicId: c.publicId,
      kind: c.kind === "rep_daily" ? "rep_daily" : "rep_code",
      code: c.code,
      amount: c.amount == null ? null : Number(c.amount),
      capPct: c.capPct == null ? null : Number(c.capPct),
      capAmount: c.capAmount == null ? null : Number(c.capAmount),
      note: c.note,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      issuer: c.issuerName ?? c.issuerEmail ?? "Unknown",
      uses: count,
      maxUses,
      status: count >= maxUses ? "used" : !c.active ? "revoked" : couponStatus(c, now) === "expired" ? "expired" : "unused",
      customer: c.customerName ?? c.customerEmail,
      orderPublicId: c.orderPublicId,
      applied: c.applied == null ? null : Number(c.applied),
    };
  });

  const href = (status?: string) => {
    const qs = new URLSearchParams();
    if (sp.from) qs.set("from", sp.from);
    if (sp.to) qs.set("to", sp.to);
    if (sp.type) qs.set("type", sp.type);
    if (sp.issuer) qs.set("issuer", sp.issuer);
    if (status) qs.set("status", status);
    const s = qs.toString();
    return s ? `/dashboard/discounts/staff-codes?${s}` : "/dashboard/discounts/staff-codes";
  };
  const stats = [
    { label: "Codes issued", value: agg.issued.toLocaleString(), hint: "Staff codes and daily coupons", href: href() },
    { label: "Used up", value: agg.used.toLocaleString(), href: href("used") },
    { label: "Open", value: agg.open.toLocaleString(), hint: "Uses left and still valid", href: href("unused") },
    { label: "Expired or revoked", value: (agg.issued - agg.used - agg.open).toLocaleString() },
    { label: "Given", value: usd(Number(agg.given)), hint: "Applied on orders" },
  ];

  return <StaffCodes stats={stats} codes={codes} spec={spec} sort={sort} total={total} page={page.page} size={page.size} />;
}

export type { StaffCodeSortColumn };
