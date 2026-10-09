import { handleStripeWebhook } from "@/lib/services/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // raw body — signature is over the exact bytes
  const { status, body } = await handleStripeWebhook(raw, req.headers.get("stripe-signature"));
  return new Response(body, { status });
}
