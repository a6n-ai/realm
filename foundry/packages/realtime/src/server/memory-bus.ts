import { EventEmitter } from "node:events";
import type { Channel, RealtimeEvent } from "../index";
import type { Bus } from "./bus";

// Process-local pub/sub. A module singleton so every route handler in this
// instance shares one emitter. High listener count is expected (one per open
// SSE stream) — lift the default max-listeners cap.
class MemoryBus implements Bus {
  private readonly emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(0);
  }
  publish(channel: Channel, event: RealtimeEvent): void {
    this.emitter.emit(channel, event);
  }
  subscribe(channel: Channel, cb: (e: RealtimeEvent) => void): () => void {
    this.emitter.on(channel, cb);
    return () => this.emitter.off(channel, cb);
  }
}

export const memoryBus: Bus = new MemoryBus();
