import { LifeBuoyIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { ChatListFallback, ConversationFallback, DetailsFallback } from "./ticket-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={LifeBuoyIcon} title="Ticket" />
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <SectionCard title="Customer">
              <ChatListFallback />
            </SectionCard>
            <SectionCard title="Ticket">
              <DetailsFallback />
            </SectionCard>
            <SectionCard title="Customer's chats">
              <ChatListFallback />
            </SectionCard>
          </div>
          <SectionCard title="Conversation">
            <ConversationFallback />
          </SectionCard>
        </div>
      </PageShell>
    </div>
  );
}
