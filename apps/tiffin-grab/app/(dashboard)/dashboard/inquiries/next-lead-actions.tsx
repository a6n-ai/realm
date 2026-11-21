"use client";
import { useState } from "react";
import { PhoneCallIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { RecommendationActions } from "@/components/dashboard/next-item/recommendation-actions";
import { whatsappHref } from "@/components/dashboard/next-item/contact-chips";
import { NoteDialog, type NoteKind } from "./_leads/status-dialog";

/** A lead row's actions: Call and Log outcome beside the name, WhatsApp, Note and Follow-up under More actions. */
export function NextLeadActions({ inquiryId, name, phone, whatsappPhone, timeZone, closed }: {
  inquiryId: string;
  name: string;
  phone: string | null;
  whatsappPhone: string | null;
  timeZone: string;
  closed: boolean;
}) {
  const [kind, setKind] = useState<NoteKind | null>(null);
  const wa = whatsappHref({ phone, whatsappPhone });
  return (
    <>
      <RecommendationActions
        primary={[
          ...(phone ? [{ key: "call", icon: PhoneIcon, label: `Call ${name}, ${formatPhone(phone)}`, href: `tel:${phone}` }] : []),
          { key: "log", icon: PhoneCallIcon, label: "Log outcome", tone: "text-emerald-600 dark:text-emerald-400", onClick: () => setKind("call") },
        ]}
        more={[
          ...(wa ? [{ key: "whatsapp", label: "WhatsApp", ariaLabel: `WhatsApp ${name}, ${formatPhone(whatsappPhone || phone)}`, href: wa }] : []),
          { key: "note", label: "Note", onSelect: () => setKind("note") },
          ...(closed ? [] : [{ key: "follow-up", label: "Follow-up", onSelect: () => setKind("follow_up") }]),
        ]}
      />
      {kind ? <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind={kind} open onOpenChange={(open) => { if (!open) setKind(null); }} /> : null}
    </>
  );
}
