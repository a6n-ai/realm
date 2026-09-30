import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Set while staff ask for a copyable invite link instead of an email.
 * better-auth's magic-link plugin always hands the url to sendMagicLink; inside
 * this scope that callback records it here and sends nothing.
 */
export const linkCapture = new AsyncLocalStorage<{ url?: string }>();
