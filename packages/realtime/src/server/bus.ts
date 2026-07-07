import type { Channel, RealtimeEvent } from "../index";

// Fan-out abstraction. MemoryBus (this package) reaches every SSE stream in the
// current process — correct for a single instance. A RedisBus adapter (same
// interface) becomes necessary only with >1 instance; not built yet.
export interface Bus {
  publish(channel: Channel, event: RealtimeEvent): void;
  subscribe(channel: Channel, cb: (e: RealtimeEvent) => void): () => void;
}
