import { desc } from "drizzle-orm";
import { ListIcon, UsersIcon } from "lucide-react";
import { ResponsiveDialog, SectionCard, StatCard } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { contactList } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  ContactListFromSegment,
  ContactListResyncButton,
  ContactListUpload,
  formatConsentDate,
} from "@realm/notifications/ui";

export const dynamic = "force-dynamic";

const CONSENT_LABEL: Record<string, string> = {
  purchase: "Purchase (expires after 24 months)",
  express_optin: "Express opt-in",
  event_signup: "Event signup",
  import_other: "Other",
};

export default async function ContactListsPage() {
  await requireAdmin();
  const [lists, { timezone }] = await Promise.all([
    db
      .select({
        publicId: contactList.publicId,
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        consentNote: contactList.consentNote,
        memberCount: contactList.memberCount,
        segmentDef: contactList.segmentDef,
      })
      .from(contactList)
      .orderBy(desc(contactList.createdAt)),
    getAppSettings(),
  ]);

  const totalContacts = lists.reduce((sum, l) => sum + l.memberCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Lists" value={lists.length} icon={ListIcon} />
        <StatCard label="Total contacts" value={totalContacts} icon={UsersIcon} />
      </div>

      <SectionCard
        title="Contact lists"
        subtitle="Uploaded audiences, with how consent was obtained."
        action={
          <div className="flex gap-2">
            <ResponsiveDialog
              title="Create from existing customers"
              description="Snapshot customers matching filters (min orders, min spend) into a list. Doesn't update live — use Resync to pull in new matches."
              trigger={<Button variant="outline">Create from customers</Button>}
            >
              <div className="p-4">
                <ContactListFromSegment requiresVerifiedPhone />
              </div>
            </ResponsiveDialog>
            <ResponsiveDialog
              title="Import a list"
              description="CSV. Duplicates and invalid rows are reported, not silently dropped."
              trigger={<Button>Import CSV</Button>}
            >
              <div className="p-4">
                <ContactListUpload />
              </div>
            </ResponsiveDialog>
          </div>
        }
      >
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lists yet.</p>
        ) : (
          <ul className="divide-y">
            {lists.map((l) => (
              <li key={l.publicId} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {CONSENT_LABEL[l.consentSource] ?? l.consentSource} ·{" "}
                    {formatConsentDate(Number(l.consentAt), timezone)}
                    {l.consentNote ? ` · ${l.consentNote}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-sm text-muted-foreground">{l.memberCount}</span>
                  {l.segmentDef && <ContactListResyncButton publicId={l.publicId} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
