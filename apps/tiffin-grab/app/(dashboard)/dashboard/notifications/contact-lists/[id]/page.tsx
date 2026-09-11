import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackButton, SectionCard, StatCard } from "@foundry/design-system";
import { UsersIcon, UserPlusIcon } from "lucide-react";
import { listContactListMembers } from "@relay/engine";
import { ContactListAddMember, ContactListMemberRow, formatConsentDate } from "@relay/engine/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { contactList } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { convertContactToCustomer } from "../actions";

export const dynamic = "force-dynamic";

const CONSENT_LABEL: Record<string, string> = {
  purchase: "Purchase (expires after 24 months)",
  express_optin: "Express opt-in",
  event_signup: "Event signup",
  import_other: "Other",
};

export default async function ContactListPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [[list], { timezone }] = await Promise.all([
    db
      .select({
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        consentNote: contactList.consentNote,
        memberCount: contactList.memberCount,
      })
      .from(contactList)
      .where(eq(contactList.publicId, id)),
    getAppSettings(),
  ]);
  if (!list) notFound();

  const members = await listContactListMembers(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    id,
  );
  if (!members) notFound();

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard/notifications/contact-lists" label="All lists" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-balance">{list.name}</h1>
        <p className="text-sm text-muted-foreground">
          {CONSENT_LABEL[list.consentSource] ?? list.consentSource} ·{" "}
          {formatConsentDate(Number(list.consentAt), timezone)}
          {list.consentNote ? ` · ${list.consentNote}` : ""}
        </p>
      </div>

      <StatCard label="Contacts" value={list.memberCount} icon={UsersIcon} />

      <SectionCard title="Add a contact" subtitle="For a handful of people — no spreadsheet needed.">
        <ContactListAddMember listPublicId={id} />
      </SectionCard>

      <SectionCard title="Contacts" subtitle="Convert a contact into a full customer account.">
        {members.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-lg border py-12 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
              <UserPlusIcon className="size-6" />
            </span>
            <p className="max-w-sm text-muted-foreground">No contacts yet.</p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {members.map((m) => (
              <ContactListMemberRow
                key={m.publicId}
                listPublicId={id}
                member={m}
                onConvert={convertContactToCustomer}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
