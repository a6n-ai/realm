import type { Channel, RealtimeEvent, RealtimeRole } from "../index";
import { memoryBus } from "./memory-bus";
import { presenceStore } from "./presence";

// Build a streaming SSE Response for one authenticated viewer on one channel.
// The open connection IS the presence signal: join on open, leave on cancel.
// Sends an initial presence snapshot, then relays bus events. A periodic comment
// keeps intermediaries from closing an idle stream.
export function sseResponse(opts: { channel: Channel; userId: string; role: RealtimeRole }): Response {
  const { channel, userId, role } = opts;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // Snapshot: who is already here (so a late joiner sees current presence).
      for (const u of presenceStore.online(channel)) {
        send({ type: "presence", userId: u.userId, role: u.role, online: true });
      }

      unsubscribe = memoryBus.subscribe(channel, send);

      // Announce self online (only when this is the first stream for the user).
      if (presenceStore.join(channel, userId, role)) {
        memoryBus.publish(channel, { type: "presence", userId, role, online: true });
      }

      ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsubscribe?.();
      if (presenceStore.leave(channel, userId)) {
        memoryBus.publish(channel, { type: "presence", userId, role, online: false });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
