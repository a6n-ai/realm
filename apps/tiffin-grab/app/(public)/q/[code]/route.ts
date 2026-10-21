import { resolveShortLink } from "@foundry/shortlinks";
import { db } from "@/db/client";

// A staff estimate's short link (/q/K7M2QXAB) → the subscribe stepper with the quoted picks.
// An unknown or mistyped code still lands somewhere useful: the plain subscribe page.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = (await resolveShortLink(db, code)) ?? "/subscribe";
  // Relative Location: the browser resolves it against the host the customer opened. request.url
  // can carry the server's own host behind a proxy (seen locally: 127.0.0.1 came back as localhost).
  return new Response(null, { status: 307, headers: { Location: target } });
}
