import type { BaseService, UpdatableService } from "@realm/database";
import type { PgTable } from "drizzle-orm/pg-core";
import { parseListParams, type Query } from "./query";
import { toResponse } from "./error-mapper";
import { json, noContent } from "./response";

type AnyBase = BaseService<PgTable>;
type AnyUpdatable = UpdatableService<PgTable>;

export interface RouteOptions {
  guard?: (req: Request) => Promise<void>;
}

const runGuard = async (opts: RouteOptions | undefined, req: Request) => {
  if (opts?.guard) await opts.guard(req);
};

// Wrap a hand-written route handler so thrown AppErrors (e.g. from auth guards)
// surface as problem+json instead of an unhandled 500 — the same try/catch the
// route factories apply. Preserves Next's (req, ctx) arguments.
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return toResponse(e);
    }
  };
}

export function createCollectionRoute(service: AnyBase, opts?: RouteOptions) {
  return {
    async GET(req: Request) {
      try {
        await runGuard(opts, req);
        const page = parseListParams(new URL(req.url));
        return json(await service.list(undefined, page));
      } catch (e) { return toResponse(e); }
    },
    async POST(req: Request) {
      try {
        await runGuard(opts, req);
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.create(body), 201);
      } catch (e) { return toResponse(e); }
    },
  };
}

export function createQueryRoute(service: AnyBase, opts?: RouteOptions) {
  return {
    async POST(req: Request) {
      try {
        await runGuard(opts, req);
        const q = (await req.json()) as Query;
        const page = { page: q.page ?? 0, size: q.size ?? 10, sort: q.sort };
        return json(await service.list(q.condition, page));
      } catch (e) { return toResponse(e); }
    },
  };
}

type Ctx = { params: Promise<{ id: string }> };

export function createResourceRoute(service: AnyUpdatable, opts?: RouteOptions) {
  return {
    async GET(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        return json(await service.read(id));
      } catch (e) { return toResponse(e); }
    },
    async PUT(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.update(id, body));
      } catch (e) { return toResponse(e); }
    },
    async PATCH(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        const body = (await req.json()) as Record<string, unknown>;
        return json(await service.update(id, body));
      } catch (e) { return toResponse(e); }
    },
    async DELETE(req: Request, ctx: Ctx) {
      try {
        await runGuard(opts, req);
        const { id } = await ctx.params;
        await service.delete(id);
        return noContent();
      } catch (e) { return toResponse(e); }
    },
  };
}
