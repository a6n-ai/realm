import { isStaffRole } from "@/lib/roles";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@foundry/commons";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/settings";
import { listMembershipsForUser } from "@/lib/services/organizations.service";
import { formatEpoch } from "@/lib/format/datetime";
import { SectionCard, UserAvatar } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { ResetPasswordButton, StatusSelect } from "../user-row";
import { requirePermission } from "@/lib/auth/guards";
import { getRoleChoices } from "@/lib/auth/role-options";
import { AdminContactForm } from "@/components/dashboard/admin-contact-form";
import { StatusBadge } from "../../status-badge";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";
import { loadMemberPanel } from "../member-panel-data";
import { MemberPanelBody } from "../member-panel";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailData params={params} />
    </Suspense>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

async function UserDetailData({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ member: ["update"] });
  const { id } = await params;

  let user;
  try {
    user = await usersService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [{ timezone }, memberships, roleCtx] = await Promise.all([
    getAppSettings(),
    listMembershipsForUser(user.publicId),
    getRoleChoices(),
  ]);
  const activeMembership = memberships.find((m) => m.organizationId === roleCtx.organizationId);
  const panel = activeMembership ? await loadMemberPanel(activeMembership.memberId) : null;

  const isStaff = isStaffRole(user.role);
  const contact = [user.email, user.phone].filter(Boolean).join(" · ");

  return (
    <>
      {/* Identity as the page heading, not a separate card — mirrors
          customers/[id]'s PageHeader pattern, swapping the icon square for the
          user's avatar since this page is about one specific person. */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar name={user.name} fallbackText={user.email} presence={user.status === "active" ? "active" : "off"} size="lg" className="mt-0.5" />
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {user.name || user.email || "User"}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="capitalize">{activeMembership?.role ?? user.role}</Badge>
              <StatusBadge status={user.status} />
            </div>
            {contact && <p className="text-muted-foreground text-sm">{contact}</p>}
          </div>
        </div>
        {isStaff && (
          <div className="flex shrink-0 items-center gap-2">
            <ResetPasswordButton id={user.publicId} role={user.role} passwordSet={user.passwordSet} variant="button" />
          </div>
        )}
      </header>

      <SectionCard title="Identity">
        <dl>
          <Field label="Username" value={user.displayUsername ?? user.username ?? "—"} />
          <Field label="Created" value={formatEpoch(user.createdAt, { mode: "datetime", timeZone: timezone })} />
          <Field label="ID" value={<code className="text-xs">{user.publicId}</code>} />
        </dl>
      </SectionCard>

      <SectionCard title="Contact" subtitle="Edit the email and phone on file.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.emailVerified ? "success-light" : "warning-light"}>
              Email {user.emailVerified ? "verified" : "unverified"}
            </Badge>
            <Badge variant={user.phoneVerified ? "success-light" : "warning-light"}>
              Phone {user.phoneVerified ? "verified" : "unverified"}
            </Badge>
          </div>
          <AdminContactForm userId={user.publicId} email={user.email ?? ""} phone={user.phone ?? ""} />
        </div>
      </SectionCard>

      <SectionCard title="Access" subtitle="Roles, permissions and organizations in the active organization.">
        {!activeMembership ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">Not a member of this organization.</p>
            <StatusSelect id={user.publicId} status={user.status} />
          </div>
        ) : panel ? (
          <MemberPanelBody data={panel} resources={RESOURCE_LABELS} showContact={false} />
        ) : (
          <p className="text-muted-foreground text-sm">You can&apos;t see this person&apos;s access.</p>
        )}
      </SectionCard>

      <SectionCard title="Profile">
        <dl>
          <Field label="Address" value={[user.addressLine, user.addressUnit, user.city, user.province, user.postalCode].filter(Boolean).join(", ") || "—"} />
          <Field label="Dietary notes" value={user.dietaryNotes || "—"} />
          <Field label="Allergens" value={user.allergens || "—"} />
          <Field label="Locale" value={user.locale} />
        </dl>
      </SectionCard>

    </>
  );
}

function UserDetailSkeleton() {
  return (
    <>
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {["Identity", "Contact", "Access", "Profile"].map((t) => (
        <SectionCard key={t} title={t}>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </SectionCard>
      ))}
    </>
  );
}
