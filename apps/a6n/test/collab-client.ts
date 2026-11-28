import { SELF } from "cloudflare:test";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/** A minimal Yjs peer over the Worker's /collab route: sync, own presence, and the room's text messages. */
export async function connectRoom(docId: string, token: string, origin = "http://localhost") {
  const doc = new Y.Doc();
  const res = await SELF.fetch(`http://localhost/collab/${docId}?token=${token}`, {
    headers: { Upgrade: "websocket", Origin: origin },
  });
  const ws = res.webSocket ?? undefined;
  let markSynced = () => {};
  let markClosed = (_: { code: number }) => {};
  const synced = new Promise<void>((resolve, reject) => {
    markSynced = resolve;
    if (!ws) reject(new Error(`room refused the connection with ${res.status}`));
  });
  // refusal tests never await this
  synced.catch(() => {});
  const closed = new Promise<{ code: number }>((resolve) => (markClosed = resolve));

  const messages: unknown[] = [];

  const send = (write: (encoder: encoding.Encoder) => void) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    write(encoder);
    ws?.send(encoding.toUint8Array(encoder));
  };

  if (ws) {
    // this compatibility date delivers binary frames as Blobs unless asked; browsers' y provider asks too
    ws.binaryType = "arraybuffer";
    ws.accept();
    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        if (event.data.startsWith("__YPS:")) messages.push(JSON.parse(event.data.slice(6)));
        return;
      }
      const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
      if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return;
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MESSAGE_SYNC);
      const type = syncProtocol.readSyncMessage(decoder, reply, doc, "remote");
      if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
      if (type === syncProtocol.messageYjsSyncStep2) markSynced();
    });
    ws.addEventListener("close", (event) => {
      markClosed({ code: event.code });
      try {
        ws.close(1000);
      } catch {
        // already closed from this side
      }
    });
    doc.on("update", (update: Uint8Array, source: unknown) => {
      if (source !== "remote") send((e) => syncProtocol.writeUpdate(e, update));
    });
    send((e) => syncProtocol.writeSyncStep1(e, doc));
  }

  const announce = (name: string) => {
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState({ user: { name } });
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]));
    ws?.send(encoding.toUint8Array(encoder));
    awareness.destroy();
  };

  return { status: res.status, ws, doc, synced, closed, messages, announce, close: () => ws?.close(1000) };
}
