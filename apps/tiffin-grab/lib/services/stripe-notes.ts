// Order-activity note prefixes written when a card payment needs staff. The Payments -> Stripe
// "Needs attention" facet matches on these, so writers and the query must share them.
export const NOTE_CC_NO_SURCHARGE = "Credit card used without surcharge";
export const NOTE_PI_OTHER_PAYMENT = "Stripe PaymentIntent";
export const NOTE_CANCELLED_ORDER = "Cancelled-order card payment";
export const NOTE_AMOUNT_MISMATCH = "Stripe amount mismatch for";
