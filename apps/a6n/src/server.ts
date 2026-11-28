import { routeCollabRequest } from "@foundry/collab/server";
import handler from "@tanstack/react-start/server-entry";
import type { Env } from "./env";
import { readSecret } from "./lib/secrets";

export { CollabRoom } from "./lib/meeting-docs/room";

export default {
  async fetch(request: Request, env: Env) {
    // the secret is read only for room sockets, so other requests pay no Secrets Store call
    if (new URL(request.url).pathname.startsWith("/collab/")) {
      const secret = await readSecret(env.COLLAB_SECRET).catch((err) => console.error("COLLAB_SECRET read failed", err));
      if (!secret) return new Response(null, { status: 503 });
      const room = await routeCollabRequest(request, {
        namespace: env.COLLAB_ROOM,
        secret,
        origin: new URL(env.BETTER_AUTH_URL).origin,
      });
      if (room) return room;
    }
    return handler.fetch(request);
  },
};
