// Client-safe: Next inlines only literal NEXT_PUBLIC_* reads, so these stay separate from env.ts.
export const publicAuthUrl = () => process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
