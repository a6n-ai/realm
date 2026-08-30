import { desc } from "drizzle-orm";
import { SectionCard } from "@realm/design-system";
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

  return (
    <div className="space-y-6">
      <SectionCard title="Contact lists" subtitle="Uploaded audiences, with how consent was obtained.">
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

      <SectionCard title="Create from existing customers" subtitle="Snapshot customers matching filters (min orders, min spend) into a list. Doesn't update live — use Resync to pull in new matches.">
        <ContactListFromSegment requiresVerifiedPhone />
      </SectionCard>

      <SectionCard title="Import a list" subtitle="CSV. Duplicates and invalid rows are reported, not silently dropped.">
        <ContactListUpload />
      </SectionCard>
    </div>
  );
}
