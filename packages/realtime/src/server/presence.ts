import type { Channel, RealtimeRole } from "../index";

export type PresentUser = { userId: string; role: RealtimeRole };

// Presence = who currently holds an open SSE stream on a channel. Ref-counted by
// userId so multiple tabs/streams for the same user don't flip offline until the
// last one closes. Process-local (single instance).
export class PresenceStore {
  private readonly channels = new Map<Channel, Map<string, { role: RealtimeRole; refs: number }>>();

  join(channel: Channel, userId: string, role: RealtimeRole): boolean {
    let users = this.channels.get(channel);
    if (!users) {
      users = new Map();
      this.channels.set(channel, users);
    }
    const existing = users.get(userId);
    if (existing) {
      existing.refs += 1;
      return false; // was already online
    }
    users.set(userId, { role, refs: 1 });
    return true; // newly online
  }

  leave(channel: Channel, userId: string): boolean {
    const users = this.channels.get(channel);
    const entry = users?.get(userId);
    if (!users || !entry) return false;
    entry.refs -= 1;
    if (entry.refs > 0) return false; // still online (other tabs)
    users.delete(userId);
    if (users.size === 0) this.channels.delete(channel);
    return true; // went offline
  }

  online(channel: Channel): PresentUser[] {
    const users = this.channels.get(channel);
    if (!users) return [];
    return [...users.entries()].map(([userId, v]) => ({ userId, role: v.role }));
  }
}

export const presenceStore = new PresenceStore();
