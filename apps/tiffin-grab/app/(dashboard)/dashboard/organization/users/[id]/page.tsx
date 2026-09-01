import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { NotFoundError, Role } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listMembershipsForUser, type MemberRole } from "@/lib/services/organizations.service";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags } from "@/db/schema";
import { formatEpoch } from "@/lib/format/datetime";
import { SectionCard, UserAvatar } from "@/components/ds";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  RoleSelect,
  StatusSelect,
  FlagToggles,
  ResetPasswordButton,
  type FlagState,
} from "../user-row";
import { AdminContactForm } from "./admin-contact-form";
import { MemberManagement } from "../../clients/member-management";

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
  await requireAdmin();
  const { id } = await params;

  let user;
  try {
    user = await usersService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [{ timezone }, defs, overrides, memberships] = await Promise.all([
    getAppSettings(),
    db.select().from(featureFlags),
    db.select().from(userFeatureFlags).where(eq(userFeatureFlags.userId, user.id)),
    listMembershipsForUser(user.publicId),
  ]);
  const ov = new Map(overrides.map((o) => [o.flagId, Boolean(o.enabled)]));
  const flags: FlagState[] = defs.map((f) => ({
    id: f.publicId,
    key: f.key,
    label: f.label,
    enabled: ov.has(f.id) ? (ov.get(f.id) as boolean) : f.defaultEnabled,
  }));

  const isStaff = user.role === Role.ADMIN || user.role === Role.MEMBER;
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
              <Badge variant="secondary">{user.role}</Badge>
              <Badge variant={user.status === "active" ? "secondary" : "outline"}>{user.status}</Badge>
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
            <Badge variant={user.emailVerified ? "secondary" : "outline"}>
              Email {user.emailVerified ? "verified" : "unverified"}
            </Badge>
            <Badge variant={user.phoneVerified ? "secondary" : "outline"}>
              Phone {user.phoneVerified ? "verified" : "unverified"}
            </Badge>
          </div>
          <AdminContactForm userId={user.publicId} email={user.email ?? ""} phone={user.phone ?? ""} />
        </div>
      </SectionCard>

      <SectionCard title="Access" subtitle="Role, account status and feature flags.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Role</span>
              <RoleSelect id={user.publicId} role={user.role} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <StatusSelect id={user.publicId} status={user.status} />
            </label>
          </div>
          {flags.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-sm">Feature flags</span>
              <FlagToggles id={user.publicId} flags={flags} />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Profile">
        <dl>
          <Field label="Address" value={[user.addressLine, user.addressUnit, user.city, user.province, user.postalCode].filter(Boolean).join(", ") || "—"} />
          <Field label="Dietary notes" value={user.dietaryNotes || "—"} />
          <Field label="Allergens" value={user.allergens || "—"} />
          <Field label="Locale" value={user.locale} />
        </dl>
      </SectionCard>

      <SectionCard title="Client access" subtitle="Organizations this user is a member of.">
        <MemberManagement
          rows={memberships.map((m) => ({
            organizationId: m.organizationId,
            userPublicId: user.publicId,
            label: m.organizationName,
            role: m.role as MemberRole,
          }))}
          fixed={{ userPublicId: user.publicId }}
          addByOrgId
        />
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

      {["Identity", "Contact", "Access", "Profile", "Client access"].map((t) => (
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
