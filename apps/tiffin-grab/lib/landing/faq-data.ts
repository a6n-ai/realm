import { referHeadline } from "@/lib/referrals/headline";
import { buildFaq, type FaqGroup } from "@/lib/landing/faq-list";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { listPublicFaqs } from "@/lib/services/faqs.service";

/** The FAQ as /faq shows it: an admin-saved list wins, else the list built from live data. */
export async function loadFaqGroups(orgId: string | null): Promise<FaqGroup[]> {
  const saved = await listPublicFaqs(orgId);
  if (saved.length > 0) return [{ heading: "", items: saved.map((f) => ({ q: f.question, a: f.answer })) }];
  const [facts, offer] = await Promise.all([loadSiteFacts(), loadReferralOffer()]);
  return buildFaq(facts, offer.on ? referHeadline(offer) : null);
}
