import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";

// A referral short link (/r/K7M2QX) → the subscribe page with ?ref=, where the proxy sets the
// referral cookie and the link preview shows the friend's card. The code is already short and
// unique, so no lookup table. A mistyped code still lands on the plain subscribe page.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code);
  const target = isReferralCodeShape(code) ? `/subscribe?ref=${code}` : "/subscribe";
  // Relative Location, as in /q: request.url can carry the server's own host behind a proxy.
  return new Response(null, { status: 307, headers: { Location: target } });
}
