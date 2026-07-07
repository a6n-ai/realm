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

  let closed = false;

  // Unclean disconnects (laptop sleep, proxy idle-kill, abrupt TCP RST) don't
  // always fire cancel() — the ping interval keeps firing into a dead
  // controller. Route all teardown through one idempotent cleanup so a guarded
  // enqueue failure and an explicit cancel() converge on the same cleanup path.
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller is already closed underneath us — tear down this
          // connection's resources instead of letting the caller (bus
          // callback or bare setInterval) throw uncaught.
          cleanup();
        }
      };

      const send = (event: RealtimeEvent) => safeEnqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // Snapshot: who is already here (so a late joiner sees current presence).
      for (const u of presenceStore.online(channel)) {
        send({ type: "presence", userId: u.userId, role: u.role, online: true });
      }

      unsubscribe = memoryBus.subscribe(channel, send);

      // Announce self online (only when this is the first stream for the user).
      if (presenceStore.join(channel, userId, role)) {
        memoryBus.publish(channel, { type: "presence", userId, role, online: true });
      }

      ping = setInterval(() => safeEnqueue(encoder.encode(": ping\n\n")), 15_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe?.();
        if (presenceStore.leave(channel, userId)) {
          memoryBus.publish(channel, { type: "presence", userId, role, online: false });
        }
      };
    },
    cancel() {
      cleanup();
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
