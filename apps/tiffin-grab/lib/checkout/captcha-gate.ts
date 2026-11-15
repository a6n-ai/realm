/** The server asks for a Turnstile token whenever the address is not known to be served, so every unknown or unserved case must send one. */
export const needsCaptchaToken = (zone: { served: boolean } | null): boolean => zone?.served !== true;
