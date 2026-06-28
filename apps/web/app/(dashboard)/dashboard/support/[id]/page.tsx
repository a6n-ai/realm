import { notFound, redirect } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { AuthError, ForbiddenError, NotFoundError } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService, type TicketStatus } from "@/lib/services/tickets.service";
import { formatEpoch } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { ReplyForm } from "./reply-form";

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Your reply needed",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "default",
  waiting_on_customer: "default",
  resolved: "secondary",
  closed: "outline",
};

const CATEGORY_LABEL: Record<string, string> = {
  order: "Order",
  billing: "Billing",
  catering: "Catering",
  general: "General",
};

export default async function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  // read + listMessages both run the service trust boundary (a customer can only
  // see their own ticket). Anything other than a real, owned ticket → not-found.
  let ticket;
  let messages;
  try {
    [ticket, messages] = await Promise.all([
      ticketsService.read(id),
      ticketsService.listMessages(id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof AuthError) notFound();
    throw e;
  }

  const { timezone } = await getAppSettings();
  const status = ticket.status as TicketStatus;
  const closed = status === "resolved" || status === "closed";

  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title={ticket.subject} />

      <SectionCard title="Conversation">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            <Badge variant="outline">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
            <span className="text-muted-foreground text-xs">
              Opened {formatEpoch(ticket.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
            </span>
          </div>

          <div className="space-y-3">
            {messages.map((m) => {
              if (m.authorType === "system") {
                return (
                  <p key={m.publicId} className="text-muted-foreground text-center text-xs">
                    {m.body} · {formatEpoch(m.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
                  </p>
                );
              }
              const mine = m.authorType === "customer";
              return (
                <div key={m.publicId} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    <p className="whitespace-pre-wrap text-pretty">{m.body}</p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {mine ? "You" : "Support"} · {formatEpoch(m.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
                  </span>
                </div>
              );
            })}
          </div>

          <ReplyForm ticketId={ticket.publicId} closed={closed} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
