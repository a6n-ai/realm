"use client";
import { useState } from "react";
import { CalculatorIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { RecommendationActions } from "@/components/dashboard/next-item/recommendation-actions";
import { whatsappHref } from "@/components/dashboard/next-item/contact-chips";
import { EstimateDialog } from "../_order/estimate-dialog";
import { TrackNoteDialog, type TrackNoteKind } from "../renewals/_track/track-note-dialog";

/** A renewal row's actions: Call and Estimate beside the name, WhatsApp, Note and Follow-up under More actions. Notes need a customer account. */
export function NextRenewalActions({ orderPublicId, customerPublicId, name, phone, closed }: {
  orderPublicId: string;
  customerPublicId: string | null;
  name: string;
  phone: string | null;
  closed: boolean;
}) {
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [kind, setKind] = useState<TrackNoteKind | null>(null);
  const wa = whatsappHref({ phone });
  return (
    <>
      <RecommendationActions
        primary={[
          ...(phone ? [{ key: "call", icon: PhoneIcon, label: `Call ${name}, ${formatPhone(phone)}`, href: `tel:${phone}` }] : []),
          { key: "estimate", icon: CalculatorIcon, label: "Estimate", hint: "Estimate a renewal: plan filled in, add codes, copy the link", onClick: () => setEstimateOpen(true) },
        ]}
        more={[
          ...(wa ? [{ key: "whatsapp", label: "WhatsApp", ariaLabel: `WhatsApp ${name}, ${formatPhone(phone)}`, href: wa }] : []),
          ...(customerPublicId ? [{ key: "note", label: "Note", onSelect: () => setKind("note" as const) }] : []),
          ...(customerPublicId && !closed ? [{ key: "follow-up", label: "Follow-up", onSelect: () => setKind("follow_up" as const) }] : []),
        ]}
      />
      {estimateOpen && <EstimateDialog open={estimateOpen} onOpenChange={setEstimateOpen} fromOrder={orderPublicId} />}
      {kind && customerPublicId && (
        <TrackNoteDialog
          orderPublicId={orderPublicId}
          customerPublicId={customerPublicId}
          kind={kind}
          open
          onOpenChange={(open) => !open && setKind(null)}
          closed={closed}
        />
      )}
    </>
  );
}
