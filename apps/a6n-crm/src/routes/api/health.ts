import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const db = await env.DB.prepare("select 1").first().then(
          (row) => row !== null,
          () => false,
        );
        return Response.json({ ok: db, db, relay: env.RELAY ? "bound" : "missing" });
      },
    },
  },
});
