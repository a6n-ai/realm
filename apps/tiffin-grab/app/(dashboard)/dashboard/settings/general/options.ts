// Shared by the form and the server action ("use server" files may only export async functions).
// CAD first: TiffinGrab is Canadian, and a store value missing here makes every save fail.
export const CURRENCIES = ["CAD", "INR", "USD", "AED", "GBP", "EUR"] as const;
export const PHONE_COUNTRIES = ["CA", "IN", "US", "AE", "GB"] as const;
