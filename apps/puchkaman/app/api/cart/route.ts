import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { handler, json, problem } from "@foundry/routes";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { CART_COOKIE } from "@/lib/cart/types";
import { cartItemsSchema, cartOwner, upsertCart } from "@/lib/services/carts.service";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * Mirror of the client cart. The cookie is the only identity a guest cart has,
 * so it is httpOnly (page scripts never read it) and grants exactly one row.
 */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = cartItemsSchema.safeParse((body as { items?: unknown } | null)?.items);
  if (!parsed.success) return problem(400, "Invalid cart");

  const jar = await cookies();
  const cookieId = jar.get(CART_COOKIE)?.value ?? null;

  const session = await getSession();
  let userId: bigint | null = null;
  let email: string | null = null;
  if (session) {
    const [row] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.publicId, session.user.id))
      .limit(1);
    userId = row?.id ?? null;
    email = row?.email ?? null;
  }

  const typed = (body as { email?: unknown } | null)?.email;
  if (!email && typeof typed === "string" && typed.includes("@") && typed.length <= 254) {
    email = typed;
  }

  // A stale cookie must never write into a signed-in customer's cart.
  if (cookieId) {
    const owner = await cartOwner(cookieId);
    if (owner?.userId != null && owner.userId !== userId) return problem(403, "Not your cart");
  }

  const { publicId } = await upsertCart({ publicId: cookieId, items: parsed.data, userId, email });

  if (publicId !== cookieId) {
    jar.set(CART_COOKIE, publicId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });
  }

  return json({ publicId });
});
