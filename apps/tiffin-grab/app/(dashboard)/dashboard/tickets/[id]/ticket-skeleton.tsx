import { Skeleton } from "@foundry/ui/skeleton";
import { ChatMessageListSkeleton } from "@foundry/design-system";
import { ReplyBoxSkeleton, TicketControlsSkeleton } from "./ticket-controls";

export function ChatListFallback() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

export function DetailsFallback() {
  return <TicketControlsSkeleton />;
}

export function ConversationFallback() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-4 w-24" />
      </div>
      <ChatMessageListSkeleton />
      <ReplyBoxSkeleton />
    </div>
  );
}
