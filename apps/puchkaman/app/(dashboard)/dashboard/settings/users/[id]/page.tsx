import { notFound } from "next/navigation";
import { NotFoundError, Role, formatPhone } from "@foundry/commons";
import { BackButton, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { listMembershipsForUser } from "@/lib/services/organizations.service";
import { UserAvatar } from "@/components/ds";
import { RoleSelect, StatusActions } from "../user-row";

/** Toronto wall-clock, like the rest of the app's operator-facing timestamps. */
const shopDateTime = (ms: number) => new Date(ms).toLocaleString("en-CA", { timeZone: "America/Toronto" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ user: ["get"] });
  const { id } = await params;

  let user;
  try {
    user = await usersService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [session, memberships] = await Promise.all([getSession(), listMembershipsForUser(user.publicId)]);
  const isSelf = (session?.user as { publicId?: string } | undefined)?.publicId === user.publicId;
  const isStaff = user.role === Role.ADMIN || user.role === Role.MEMBER;

  return (
    <PageShell>
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
              <Badge variant={user.status === "active" ? "default" : "outline"}>{user.status}</Badge>
            </div>
            {(user.email || user.phone) && (
              <p className="text-muted-foreground text-sm">
                {[user.email, user.phone ? formatPhone(user.phone) : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isStaff && <StatusActions publicId={user.publicId} email={user.email} status={user.status} isSelf={isSelf} />}
          <BackButton href="/dashboard/settings/users" label="All accounts" />
        </div>
      </header>

      <SectionCard title="Identity">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Role">
            {isSelf ? (
              <span className="text-muted-foreground text-xs uppercase">{user.role}</span>
            ) : (
              <RoleSelect publicId={user.publicId} role={user.role} status={user.status} isSelf={isSelf} />
            )}
          </Field>
          <Field label="Email">
            {user.email ?? "—"}
            {user.email && user.emailVerified ? <Badge variant="outline" className="ml-2">verified</Badge> : null}
          </Field>
          <Field label="Phone">
            {user.phone ? formatPhone(user.phone) : "—"}
            {user.phone && user.phoneVerified ? <Badge variant="outline" className="ml-2">verified</Badge> : null}
          </Field>
          <Field label="Created">{shopDateTime(user.createdAt)}</Field>
          <Field label="User id">
            <span className="font-mono text-xs">{user.publicId}</span>
          </Field>
        </dl>
      </SectionCard>

      {/* Read-only — editing membership from the user side is out of scope
          (see member-management.tsx's header comment); use the client's own
          detail page to add or remove members. */}
      <SectionCard title="Client access" subtitle="Organizations this user is a member of.">
        {memberships.length > 0 ? (
          <ul className="divide-y">
            {memberships.map((m) => (
              <li key={m.organizationId} className="flex items-center justify-between py-2 text-sm">
                <span>{m.organizationName}</span>
                <Badge variant="secondary">{m.role}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Not a member of any client.</p>
        )}
      </SectionCard>
    </PageShell>
  );
}
