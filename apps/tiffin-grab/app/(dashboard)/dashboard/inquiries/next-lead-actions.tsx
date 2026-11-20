"use client";
import { useState } from "react";
import { EllipsisIcon, PhoneCallIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { ROW_ACTION_CLASS, RowActionTooltipButton } from "@/components/ds";
import { whatsappHref } from "@/components/dashboard/next-item/contact-chips";
import { NoteDialog, type NoteKind } from "./_leads/status-dialog";

/** A lead row's actions: Call and Log outcome beside the name, Message, Note and Follow-up under More actions. */
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
      {phone ? (
        <RowActionTooltipButton icon={PhoneIcon} label={`Call ${name}, ${formatPhone(phone)}`} href={`tel:${phone}`} />
      ) : null}
      <RowActionTooltipButton icon={PhoneCallIcon} label="Log outcome" tone="text-emerald-600 dark:text-emerald-400" onClick={() => setKind("call")} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" aria-label="More actions" className={ROW_ACTION_CLASS} />}>
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {wa ? <DropdownMenuItem render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>Message</DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={() => setKind("note")}>Note</DropdownMenuItem>
          {closed ? null : <DropdownMenuItem onSelect={() => setKind("follow_up")}>Follow-up</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {kind ? <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind={kind} open onOpenChange={(open) => { if (!open) setKind(null); }} /> : null}
    </>
  );
}
