import { MailIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { ButtonGroup } from "@foundry/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

const digits = (p: string) => p.replace(/\D/g, "");

/** WhatsApp goes to the WhatsApp number when one is set, else the main phone. */
export function whatsappHref(contact: { phone: string | null; whatsappPhone?: string | null }): string | null {
  const number = digits(contact.whatsappPhone || contact.phone || "");
  return number ? `https://wa.me/${number}` : null;
}

export type ContactChipsProps = {
  name: string;
  phone: string | null;
  whatsappPhone?: string | null;
  email?: string | null;
  /** Icon-only call and WhatsApp buttons with tooltips, for dense cards. */
  compact?: boolean;
};

function IconChip({ label, tip, href, icon: Icon, external }: { label: string; tip: string; href: string; icon: LucideIcon; external?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" asChild>
          <a href={href} aria-label={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Icon className="size-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Call, WhatsApp and email as outline links; they never take the primary style. */
export function ContactChips({ name, phone, whatsappPhone, email, compact }: ContactChipsProps) {
  const wa = whatsappHref({ phone, whatsappPhone });
  const waNumber = whatsappPhone || phone;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {phone ? (
          <IconChip label={`Call ${name}, ${formatPhone(phone)}`} tip={`Call ${formatPhone(phone)}`} href={`tel:${phone}`} icon={PhoneIcon} />
        ) : (
          <Badge variant="outline">No phone</Badge>
        )}
        {wa ? (
          <IconChip label={`WhatsApp ${name}, ${formatPhone(waNumber ?? "")}`} tip="WhatsApp" href={wa} icon={MessageCircleIcon} external />
        ) : null}
      </div>
    );
  }
  const emailChip = email ? (
    <Button variant="outline" size="sm" asChild>
      <a href={`mailto:${email}`}>
        <MailIcon className="size-4" />
        {email}
      </a>
    </Button>
  ) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {phone ? (
        <ButtonGroup>
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${phone}`} aria-label={`Call ${name}, ${formatPhone(phone)}`}>
              <PhoneIcon className="size-4" />
              {formatPhone(phone)}
            </a>
          </Button>
          {wa ? (
            <Button variant="outline" size="sm" asChild>
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${name}, ${formatPhone(waNumber)}`}>
                <MessageCircleIcon className="size-4" />
                WhatsApp
              </a>
            </Button>
          ) : null}
          {emailChip}
        </ButtonGroup>
      ) : (
        <>
          <Badge variant="outline">No phone</Badge>
          {emailChip}
        </>
      )}
    </div>
  );
}
