import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Mint a short-lived AppSync auth token for the logged-in user. The client
 * presents it when opening the `onNotification` subscription; the Lambda
 * authorizer verifies it and the subscription is pinned to this user's id.
 */
export async function GET(): Promise<Response> {
  const session = await getSession();
  const publicId = session?.user?.id;
  if (!publicId) return new Response("unauthorized", { status: 401 });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId));
  if (!user) return new Response("unauthorized", { status: 401 });

  const secret = process.env.APPSYNC_AUTH_SECRET;
  if (!secret) return new Response("appsync not configured", { status: 503 });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  return Response.json({ token, userId: String(user.id) });
}
