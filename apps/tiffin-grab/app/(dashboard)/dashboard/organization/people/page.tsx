import { Suspense } from "react";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { parseSort } from "@foundry/design-system/list-sort";
import { whoCan, type ResourceLabel, type WhoCanHit } from "@foundry/crm";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/guards";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";
import { getRoleChoices, type RoleChoice } from "@/lib/auth/role-options";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { getOrgAccessMatrix } from "@/lib/services/org-access-matrix";
import { getMemberOrganizations, listOrganizations } from "@/lib/services/organizations.service";
import { requestNow } from "@/lib/dates/request-now";
import { SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { inviteBucket, memberStats, type InviteBucket } from "../org-stats";
import { InvitesList, InvitesListSkeleton, type InviteRow } from "../invites/invites-list";
import { getInvitationsForOrgs } from "../invites/invites-query";
import { InviteUserButton } from "../members/invite-user-button";
import { matchesCondition } from "../members/member-filter";
import { getMembersForOrgs } from "../members/members-query";
import { loadMemberPanel } from "../members/member-panel-data";
import { MemberSheet } from "../members/member-panel";
import { toPeopleRows } from "../members/people-rows";
import { UsersList, UsersListSkeleton } from "../members/users-list";
import { WhoCanFilter } from "../members/who-can-filter";
import type { UserStatusValue } from "../members/actions";

const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];
const INVITE_BUCKETS: readonly InviteBucket[] = ["pending", "accepted", "expired", "canceled"];

// Server-authored so parseFilterState (server) and ReuiFacetFilters (client) stay in lockstep.
const buildSpec = (roles: RoleChoice[], areas: ResourceLabel[]): FacetDef[] => [
  { kind: "multi", field: "role", label: "Role", options: roles.map((r) => ({ value: r.value, label: r.label })) },
  { kind: "multi", field: "area", label: "Area", options: areas.map((a) => ({ value: a.resource, label: a.label })) },
  { kind: "pills", field: "status", label: "Status", options: USER_STATUSES.map((s) => ({ value: s, label: s })) },
  { kind: "pills", field: "password", label: "Password", options: [{ value: "unset", label: "No password yet" }] },
  { kind: "search", fields: ["name", "email", "phone"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

function bucketCounts(rows: InviteRow[], now: number): Record<InviteBucket | "all", number> {
  const counts = { pending: 0, accepted: 0, expired: 0, canceled: 0, all: rows.length };
  for (const r of rows) counts[inviteBucket(r, now)]++;
  return counts;
}

export default function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <>
          <StatCardsSkeleton count={5} />
          <SectionCard title="People">
            <UsersListSkeleton />
          </SectionCard>
          <SectionCard title="Invitations">
            <InvitesListSkeleton />
          </SectionCard>
        </>
      }
    >
      <PeopleData searchParams={searchParams} />
    </Suspense>
  );
}

// Small dataset (org-scoped staff count), so filter, search and sort run in memory before paging.
async function PeopleData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ member: ["update"] });
  const session = await getSession();
  const sp = await searchParams;
  const activeOrgId = session?.session.activeOrganizationId;

  const sort = parseSort(sp, ["name", "email", "role", "status"], { column: "email", dir: "asc" });
  const SORT_COLUMNS = { name: "name", email: "email", role: "orgRole", status: "status" } as const;

  const visible = await resolveSessionVisibleOrgIds(session);
  const inviteOrgIds = visible === "all" ? (await listOrganizations()).map((o) => o.id) : visible;

  const [{ options, canInvite }, members, matrix, invites, directOrgs] = await Promise.all([
    getRoleChoices(),
    activeOrgId ? getMembersForOrgs([activeOrgId]) : [],
    activeOrgId ? getOrgAccessMatrix(activeOrgId) : null,
    getInvitationsForOrgs(inviteOrgIds),
    getMemberOrganizations(session),
  ]);

  const aboveViewer = options.filter((o) => o.locked).map((o) => o.value);
  const owners = matrix?.rows.filter((r) => r.roles.includes("owner")).length ?? 0;
  const people = toPeopleRows(members, matrix?.rows ?? [], RESOURCE_LABELS, session?.user.id ?? null, aboveViewer);
  const nameById = new Map((matrix?.rows ?? []).map((r) => [r.id, r.name]));

  const spec = buildSpec(options, RESOURCE_LABELS);
  const { condition, page } = parseFilterState(spec, sp);

  const who = sp.who?.trim() ?? "";
  const hits: WhoCanHit[] = matrix && who ? whoCan(matrix.rows, RESOURCE_LABELS, who) : [];
  // A "who can" query keeps only the holders of a matching permission, even when none match.
  const holderIds = who ? new Set(hits.flatMap((h) => h.holders.map((x) => x.rowId))) : null;

  const filtered = people.filter(
    (r) => (!condition || matchesCondition(r, condition)) && (!holderIds || holderIds.has(r.memberId)),
  );
  const dir = sort.dir === "asc" ? 1 : -1;
  const sortField = SORT_COLUMNS[sort.column];
  filtered.sort((a, b) => String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? "")) * dir);

  const total = filtered.length;
  const from = pageOffset(page.page, page.size);
  const rows = filtered.slice(from, from + page.size);

  const panel = sp.member ? await loadMemberPanel(sp.member) : null;

  const now = requestNow();
  const inviteStatus = INVITE_BUCKETS.find((b) => b === sp.invite);
  const shownInvites = inviteStatus ? invites.filter((r) => inviteBucket(r, now) === inviteStatus) : invites;

  return (
    <>
      <StatCards items={memberStats(members)} />
      <SectionCard
        title="People"
        subtitle="Everyone with console access to this organization. Open a person to change their details."
        action={canInvite ? <InviteUserButton roles={options.filter((r) => !r.locked)} /> : undefined}
      >
        <div className="grid gap-4">
          {matrix && matrix.platformAdmins.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Platform admins with access to every organization:{" "}
              {matrix.platformAdmins.map((a) => a.name).join(", ")}
            </p>
          )}
          {matrix && matrix.noRole.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {matrix.noRole.length} {matrix.noRole.length === 1 ? "person has" : "people have"} no role, so no access.
            </p>
          )}
          <WhoCanFilter value={who} results={hits} names={Object.fromEntries(nameById)} />
          <UsersList
            spec={spec}
            rows={rows}
            total={total}
            page={page.page}
            size={page.size}
            sort={sort}
            roleCtx={{ options, aboveViewer, owners }}
          />
        </div>
      </SectionCard>
      <SectionCard
        title="Invitations"
        subtitle="Staff invited by email. Expired invites can be resent; pending ones canceled."
      >
        <InvitesList
          param="invite"
          rows={shownInvites}
          status={inviteStatus ?? "all"}
          counts={bucketCounts(invites, now)}
          actionableOrgIds={directOrgs.map((o) => o.id)}
        />
      </SectionCard>
      {panel && <MemberSheet data={panel} resources={RESOURCE_LABELS} />}
    </>
  );
}
