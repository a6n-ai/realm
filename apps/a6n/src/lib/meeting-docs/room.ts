import { CollabRoom as BaseCollabRoom, type CollabEvent } from "@foundry/collab/server";
import { isDocOpen } from "../docs/meta";
import { getDb } from "../../db/client";
import type { Env } from "../../env";
import { readSecret } from "../secrets";
import { isShareActive, loadSnapshot, recordRoomEvent, saveSnapshot } from "./room-store";

/** The meeting doc's Durable Object, one per doc. Exported by src/server.ts only. */
export class CollabRoom extends BaseCollabRoom<Env> {
  protected async secret(): Promise<string> {
    const secret = await readSecret(this.env.COLLAB_SECRET);
    if (!secret) throw new Error("COLLAB_SECRET is not set");
    return secret;
  }

  // every connection passes here, whatever its token says: a trashed doc admits nobody
  protected async authorize(token: string | null) {
    const claims = await super.authorize(token);
    return claims && (await isDocOpen(getDb(this.env), claims.doc)) ? claims : null;
  }

  /** RPC: drop every open connection. */
  async closeAll(): Promise<void> {
    for (const conn of this.getConnections()) conn.close(4403, "closed");
  }

  protected loadSnapshot(docId: string) {
    return loadSnapshot(getDb(this.env), docId);
  }

  protected saveSnapshot(docId: string, snapshot: Uint8Array, text: string) {
    return saveSnapshot(getDb(this.env), docId, snapshot, text);
  }

  protected onEvent(docId: string, event: CollabEvent) {
    return recordRoomEvent(getDb(this.env), docId, event);
  }

  protected isShareActive(docId: string, shareId: string, until: number | null) {
    return isShareActive(getDb(this.env), docId, shareId, until);
  }
}
