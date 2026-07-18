import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { NotFoundError, Role } from "@realm/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags } from "@/db/schema";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import {
  RoleSelect,
  StatusSelect,
  FlagToggles,
  ResetPasswordButton,
  type FlagState,
} from "../user-row";
import { AdminContactForm } from "./admin-contact-form";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="User" />
      <Suspense fallback={<UserDetailSkeleton />}>
        <UserDetailData params={params} />
      </Suspense>
    </PageShell>
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

  const [{ timezone }, defs, overrides] = await Promise.all([
    getAppSettings(),
    db.select().from(featureFlags),
    db.select().from(userFeatureFlags).where(eq(userFeatureFlags.userId, user.id)),
  ]);
  const ov = new Map(overrides.map((o) => [o.flagId, Boolean(o.enabled)]));
  const flags: FlagState[] = defs.map((f) => ({
    id: f.publicId,
    key: f.key,
    label: f.label,
    enabled: ov.has(f.id) ? (ov.get(f.id) as boolean) : f.defaultEnabled,
  }));

  const isStaff = user.role === Role.ADMIN || user.role === Role.MEMBER;

  return (
    <>
      <SectionCard title="Identity">
        <dl>
          <Field label="Name" value={user.name ?? "—"} />
          <Field label="Username" value={user.displayUsername ?? user.username ?? "—"} />
          <Field label="Role" value={<Badge variant="secondary">{user.role}</Badge>} />
          <Field label="Status" value={<Badge variant={user.status === "active" ? "secondary" : "outline"}>{user.status}</Badge>} />
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
          {isStaff && (
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <span className="text-muted-foreground text-sm">Reset to a temporary password</span>
              <ResetPasswordButton id={user.publicId} role={user.role} />
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
    </>
  );
}

function UserDetailSkeleton() {
  return (
    <>
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
