import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/brand";
import type { SiteFacts } from "@/lib/landing/site-facts";
import { shortMoney } from "@/lib/landing/live-figures";
import { dropOffNote } from "@/lib/landing/llms-text";

export type FaqGroup = { heading: string; items: { q: string; a: string }[] };

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The default FAQ. Every answer is a fact from the policy pages or live data; a question whose fact is
 *  missing is left out, never guessed. `referral` is the live referral headline, null while referrals are off. */
export function buildFaq(f: SiteFacts, referral: string | null): FaqGroup[] {
  const m = (n: number) => shortMoney(n, f.currency);
  const sized = f.plans.flatMap((p) => p.sizes.filter((s) => !s.trial));
  const small = sized[0] && sized.reduce((a, b) => (b.rate < a.rate ? b : a));
  const big = sized[0] && sized.reduce((a, b) => (b.rate > a.rate ? b : a));
  const kcal = sized.length ? [Math.min(...sized.map((s) => s.kcalMin)), Math.max(...sized.map((s) => s.kcalMax))] : null;
  const planNames = f.plans.map((p) => p.name);
  const hasProtein = sized.some((s) => s.proteinG != null);
  const perPlan = f.plans.map((p) => {
    const rs = p.sizes.filter((s) => !s.trial).map((s) => s.rate);
    return rs.length ? `${p.name} ${m(Math.min(...rs))}${Math.max(...rs) > Math.min(...rs) ? ` to ${m(Math.max(...rs))}` : ""}` : null;
  }).filter((x): x is string => x != null);

  const delivery: FaqGroup["items"] = [];
  if (f.areas.length) delivery.push({ q: "Where do you deliver?", a: `We deliver across the Greater Toronto Area, to ${f.areas.length} areas today: ${and(f.areas)}. Each area has its own delivery window. If your area is not on the list yet, you can join the waitlist.` });
  delivery.push({ q: "How do I check if you deliver to me?", a: "Tap your area on the map on the Locations page to see whether we deliver there and which window you get. Your full address is confirmed at checkout. If we do not serve your area yet, you can join the waitlist." });
  if (f.runs.length) delivery.push({ q: "What time does my tiffin arrive?", a: `${f.runs.length === 1 ? `Tiffins arrive between ${f.runs[0]!.label}.` : `There are ${f.runs.length} delivery windows: ${and(f.runs.map((r) => r.label))}. Your postal code decides which one you get.`} Windows are estimates, not fixed times, because routes change daily with traffic, weather and volume. We share your window the evening before or the morning of delivery.` });
  delivery.push({ q: "Which days do you deliver?", a: "Standard deliveries run Monday to Friday. Saturday and Sunday tiffins, on meal sizes that include the weekend dish, come with your Friday delivery. Delivery days may change as we grow. For public holidays, we tell active subscribers at least 48 hours ahead by email or WhatsApp, so you know about any off-day before it happens." });
  delivery.push({ q: "How much is delivery?", a: f.free
    ? `Delivery is free. The price per tiffin is all you pay for it, and we add no fuel or hidden fees, except clearly disclosed custom or out-of-area arrangements.${dropOffNote(f)} Your checkout shows every line of the total before you pay, so you can confirm the final amount first.`
    : "Delivery carries a charge, shown as its own line at checkout before you pay. The amount depends on your address, so you always see it first. We add no fuel or other hidden fees, except clearly disclosed custom or out-of-area arrangements." });
  delivery.push({ q: "What if I am not home?", a: "We make one delivery attempt in your window. If you will be out, tell us a safe drop-off spot, like your doorstep or concierge, at least 12 hours ahead. Share buzzer or access codes 24 hours ahead. Without that, the delivery can be recorded as failed and is not refunded." });
  delivery.push({ q: "What if a delivery fails or the weather is bad?", a: "If a delivery fails because of our error, we credit that day to your plan within 24 hours. Severe weather, road closures or other emergencies can delay or cancel deliveries. Those days are credited too, and we tell you by email or WhatsApp as soon as we can." });

  const changing: FaqGroup["items"] = [];
  if (f.cutoff) changing.push({ q: "What is the cutoff to change or pause a day?", a: `You can change or pause any day by ${f.cutoff} the night before it. The cutoff is the same on every delivery run. If you would rather ask us, message us on WhatsApp or email at least 24 hours before your next delivery, and we will sort it out.` });
  changing.push({ q: "Can I skip a day?", a: `Yes. Pause the day${f.cutoff ? ` before the ${f.cutoff} cutoff the night before` : " before the cutoff"} and it stays yours: move it to a later date, or let it go to the end of your plan. Unused days are credited to the end of the period, not refunded as cash.` });
  changing.push({ q: "Can I pause my whole plan?", a: "Yes. Ask us at least 24 hours before your next delivery, by WhatsApp or email. Unused days can be credited to the end of your plan, not refunded in cash. Plans are tied to your delivery address, so tell us before you move, and we will confirm your new area." });
  changing.push({ q: "Can I choose my dishes?", a: `Yes. Each week you pick dishes from the released menu. This week's dishes are on the Menu page, day by day, so you can see what is coming before you choose.${f.cutoff ? ` Change any day before the ${f.cutoff} cutoff the night before.` : " Change any day before the cutoff the night before."}` });

  const plans: FaqGroup["items"] = [];
  plans.push({ q: "How do I start a plan?", a: `Open the plan builder and pick your diet, meal size, sides, delivery days and number of weeks, then check out. You sign in at checkout, and you see the total before you pay.${f.trial ? " Not sure yet? Start with a trial first." : " The Pricing page lists every size and rate."}` });
  if (f.from != null) plans.push({ q: "How much does a tiffin cost?", a: `Tiffins start from ${m(f.from)} each. The rate depends on your diet and meal size${perPlan.length ? `: ${perPlan.join(", ")} a tiffin` : ""}. Longer plans lower it further. The Pricing page lists every size, and the plan builder shows your total before you pay.` });
  plans.push({ q: "How does pricing work?", a: `You pay a per-tiffin rate times the number of tiffins in your plan. The rate comes from your diet and meal size, and longer plans take a percentage off every tiffin. Prices are in ${f.currency}, and plans are paid upfront for the length you choose.` });
  if (f.weeksOff.length) plans.push({ q: "Do longer plans cost less?", a: `Yes. ${and(f.weeksOff.map((d) => `${d.percent}% off every tiffin for ${d.label}`))}. The longer the plan, the more comes off each tiffin. The plan builder applies the discount for you and shows the total before you pay. The Pricing page lays out each step.` });
  if (f.trial) plans.push({ q: "Can I try before I commit?", a: `Yes. You can try ${f.trial.length} first at ${m(f.trial.rate)} a tiffin. It is a low-commitment way to taste the food before you pick a plan. Trial purchases are not refundable, so choose your days carefully. Start one from the Pricing page.` });
  if (referral) plans.push({ q: "Is there a referral reward?", a: `Yes. ${referral} Share your Tiffin Grab link, and when a friend pays for their first plan, you both get coins. Coins are credited to your wallet. The Refer page has your link and the current offer.` });

  const food: FaqGroup["items"] = [];
  if (small && big) {
    food.push({ q: "What comes in a tiffin?", a: `Each tiffin is a home-style meal. ${small.name} has ${small.parts.join(", ") || "a set meal"}; ${big.name} has ${big.parts.join(", ") || "a set meal"}. You choose sides when you build your plan. The Pricing page lists what is in every size, and the Menu page shows each day's dishes.` });
    food.push({ q: "What meal sizes are there?", a: `We have ${sized.length} meal sizes, from ${small.name} to ${big.name}.${kcal ? ` Calories run ${kcal[0]} to ${kcal[1]} per tiffin.` : ""} Each size lists its calories${hasProtein ? " and protein" : ""} on the Pricing page. Rates run from ${m(small.rate)} to ${m(big.rate)} a tiffin, depending on diet and size.` });
  }
  if (planNames.length > 1) food.push({ q: "Do you have vegetarian and non-veg meals?", a: `Yes. You choose your diet when you build your plan: ${and(planNames)}. Each has its own meal sizes and per-tiffin rates, shown side by side on the Pricing page. For allergies or other dietary needs, contact us before you order.` });
  food.push({ q: "How are meals packed, and how do I store and reheat them?", a: "Meals are prepared fresh and packed in food-safe materials. Refrigerate within two hours of delivery if you are not eating right away, and eat refrigerated meals within 24 hours. Reheat thoroughly, and do not refreeze a meal that has been refrigerated." });

  const pay: FaqGroup["items"] = [
    { q: "How do I pay?", a: `You pay by card through Stripe, or by Interac e-Transfer. Plans are paid upfront for the length you choose, in ${f.currency}. With an e-Transfer, deliveries start once we confirm it. Automatic renewal applies only if checkout says so; otherwise you renew by hand.` },
    { q: "Can I get a refund?", a: "Trial and weekly plans are not refundable, except where the law requires. Monthly plans are generally non-refundable once started, but you can cancel in writing at least 48 hours before your first delivery for a full refund. Your rights under Ontario consumer law still apply." },
    { q: "Can I cancel after my plan starts?", a: "Monthly fees are generally non-refundable after the plan starts. If you need a break, pause instead: unused days are credited to the end of your plan. If we stop serving your area after you buy, you get a pro-rata refund for undelivered days within 14 business days." },
    { q: "What if there is a problem with my meal?", a: `Report it within two hours of delivery, in writing to ${CONTACT_EMAIL}, with photos, your order number and the delivery time. We aim to reply within three business days. A fix can be a replacement meal or a credit for one service day. Storage after delivery is not covered.` },
    { q: "How long do refunds take?", a: "Approved refunds go back the way you paid: to your card, or by Interac e-Transfer. Staff review your written request first; review can take up to 3 to 4 weeks, and nothing is refunded until we confirm by email." },
  ];

  const contact: FaqGroup["items"] = [
    { q: "How do I contact you?", a: `Email ${CONTACT_EMAIL} or message us on WhatsApp at ${CONTACT_PHONE}. The Contact page also takes questions about a plan, an area or an order. Refund requests must be in writing by email, so there is a record, and a phone call or WhatsApp alone is not a formal claim.` },
  ];

  return [
    { heading: "Delivery and areas", items: delivery },
    { heading: "Changing or pausing", items: changing },
    { heading: "Plans and prices", items: plans },
    { heading: "Food", items: food },
    { heading: "Payments and refunds", items: pay },
    { heading: "Getting in touch", items: contact },
  ].filter((g) => g.items.length > 0);
}
