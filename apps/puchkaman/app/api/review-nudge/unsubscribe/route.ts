import { handleReviewUnsubscribe } from "@foundry/google-reviews";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";

// Unauthenticated by design — the guest email inbox is the only "session" this
// link has. The signed token is the auth; no login required, no error surfaced
// for a bad token (see handleReviewUnsubscribe — never reveals whether the
// address exists or the token was valid).
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) {
    await handleReviewUnsubscribe({
      email: url.searchParams.get("email"),
      token: url.searchParams.get("token"),
      secret,
      nudgeStore: reviewNudgeStore,
    });
  }

  return new Response(
    "You won't receive any more review requests from Puchkaman for this address.",
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const GET = handle;
