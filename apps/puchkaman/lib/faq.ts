/**
 * Single source of FAQ copy — the /faq page and the homepage FAQ section both
 * read this. Every answer is sourced from facts already established elsewhere
 * in this codebase (hours, delivery radius/discount, forms); nothing fabricated.
 *
 * Ordered most-asked first: the homepage renders all of them, and on phones CSS
 * (`.faq-list--home`) hides the tail so the leading questions stay above a
 * reasonable scroll.
 */
export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: "What are Puchkaman's hours?",
    a: "We're open Sunday–Thursday 3:00pm–2:00am and Friday–Saturday 3:00pm–3:00am at 3315 Danforth Ave, Scarborough, ON.",
  },
  {
    q: "Do you deliver, and how far?",
    a: "Yes. Order direct and we deliver ourselves — instantly within 7km at 15% off, or on a scheduled time slot beyond 7km with a $35 order minimum. For the rest of the GTA, find us on Uber Eats and DoorDash.",
  },
  {
    q: "How long does pickup take?",
    a: "About 15 minutes from ordering — order ahead online, walk in, walk out.",
  },
  {
    q: "Do you do catering?",
    a: "Yes — live puchka and chaat stations for birthdays, weddings, offices, private and community events across the GTA. Submit a quote request and we reply within 24 hours.",
  },
  {
    q: "Do you offer vegetarian options?",
    a: "Yes — vegetarian puchkas like Corn Cheese, Paneer Schezwan, Mushroom Blast, Veg Mo-Puchka, Aloo, and Dahi Puchka, plus sweet options like Chocolate and Strawberry Puchka. We prepare food in a shared kitchen, so let us know about any dietary restrictions if that matters for your order.",
  },
  {
    q: "How do I pay for an online order?",
    a: "Online pickup and delivery orders are paid by card at checkout.",
  },
  {
    q: "Can you accommodate food allergies?",
    a: "Let us know about any allergies or dietary restrictions in the catering request form and we'll do our best to accommodate. We prepare food in a shared kitchen, so we can't guarantee a completely allergen-free environment — if you have a serious allergy, please contact us directly before ordering.",
  },
  {
    q: "Can I schedule an order?",
    a: "Delivery beyond our instant 7km radius is scheduled — you pick a time slot at checkout, anywhere from an hour out to this time tomorrow. We don't book further than a day ahead. Pickup and instant delivery within 7km are same-day only (pickup is ready in about 15 minutes), not schedulable in advance.",
  },
];
