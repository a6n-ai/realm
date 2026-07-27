/**
 * Clover environment + regional hostnames.
 *
 * Authorize UI hosts differ from token/API hosts (sandbox.dev.clover.com vs
 * apisandbox.dev.clover.com). See https://docs.clover.com/dev/docs/use-oauth
 */

export type CloverEnvironment = "sandbox" | "production";
export type CloverRegion = "na" | "eu" | "la";

export type CloverHosts = {
  /** Browser OAuth authorize host (no scheme). */
  authorizeHost: string;
  /** Token exchange / refresh / Platform API host (no scheme). */
  apiHost: string;
  /** Ecommerce / SCL API host (no scheme). Documented for later phases. */
  ecommerceHost: string;
  /** Card tokenization host (no scheme). Documented for later phases. */
  tokenHost: string;
};

const SANDBOX: CloverHosts = {
  authorizeHost: "sandbox.dev.clover.com",
  apiHost: "apisandbox.dev.clover.com",
  ecommerceHost: "scl-sandbox.dev.clover.com",
  tokenHost: "token-sandbox.dev.clover.com",
};

const PRODUCTION: Record<CloverRegion, CloverHosts> = {
  na: {
    authorizeHost: "www.clover.com",
    apiHost: "api.clover.com",
    ecommerceHost: "scl.clover.com",
    tokenHost: "token.clover.com",
  },
  eu: {
    authorizeHost: "www.eu.clover.com",
    apiHost: "api.eu.clover.com",
    ecommerceHost: "scl.eu.clover.com",
    tokenHost: "token.clover.com",
  },
  la: {
    authorizeHost: "www.la.clover.com",
    apiHost: "api.la.clover.com",
    ecommerceHost: "scl.la.clover.com",
    tokenHost: "token.clover.com",
  },
};

export function resolveCloverHosts(
  environment: CloverEnvironment,
  region: CloverRegion = "na",
): CloverHosts {
  if (environment === "sandbox") return SANDBOX;
  return PRODUCTION[region];
}

export function httpsOrigin(host: string): string {
  return `https://${host}`;
}
