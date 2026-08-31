import {
  cloverTokenPairSchema,
  type CloverAppCredentials,
  type CloverTokenPair,
} from "./config";
import { httpsOrigin, resolveCloverHosts, type CloverEnvironment, type CloverRegion } from "./urls";

export type BuildAuthorizeUrlInput = {
  appId: string;
  redirectUri: string;
  /** Opaque CSRF / correlation value echoed on callback. */
  state?: string;
  environment?: CloverEnvironment;
  region?: CloverRegion;
};

/** Merchant-facing OAuth authorize URL (high-trust auth-code flow). */
export function buildCloverAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const hosts = resolveCloverHosts(input.environment ?? "sandbox", input.region ?? "na");
  const url = new URL(`${httpsOrigin(hosts.authorizeHost)}/oauth/v2/authorize`);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  if (input.state) url.searchParams.set("state", input.state);
  return url.toString();
}

export type CloverOAuthCallbackParams = {
  code?: string | null;
  merchantId?: string | null;
  state?: string | null;
  error?: string | null;
};

/** Parse query params from Clover's redirect (`code` + `merchant_id`). */
export function parseCloverOAuthCallback(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): CloverOAuthCallbackParams {
  const get = (key: string): string | null => {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };
  return {
    code: get("code"),
    merchantId: get("merchant_id"),
    state: get("state"),
    error: get("error"),
  };
}

type CloverTokenResponse = {
  access_token: string;
  access_token_expiration: number;
  refresh_token: string;
  refresh_token_expiration: number;
};

function mapTokenResponse(raw: CloverTokenResponse): CloverTokenPair {
  return cloverTokenPairSchema.parse({
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    accessTokenExpiration: raw.access_token_expiration,
    refreshTokenExpiration: raw.refresh_token_expiration,
  });
}

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Clover OAuth returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "message" in json
        ? String((json as { message: unknown }).message)
        : text.slice(0, 200) || res.statusText;
    throw new Error(`Clover OAuth failed (${res.status}): ${msg}`);
  }
  return json as T;
}

export type ExchangeCodeInput = {
  credentials: CloverAppCredentials;
  code: string;
};

/** POST /oauth/v2/token — exchange auth code for expiring token pair. */
export async function exchangeCloverAuthorizationCode(
  input: ExchangeCodeInput,
): Promise<CloverTokenPair> {
  const hosts = resolveCloverHosts(input.credentials.environment, input.credentials.region);
  const url = `${httpsOrigin(hosts.apiHost)}/oauth/v2/token`;
  const raw = await postJson<CloverTokenResponse>(url, {
    client_id: input.credentials.appId,
    client_secret: input.credentials.appSecret,
    code: input.code,
  });
  return mapTokenResponse(raw);
}

export type RefreshTokensInput = {
  credentials: Pick<CloverAppCredentials, "appId" | "environment" | "region">;
  refreshToken: string;
};

/** POST /oauth/v2/refresh — rotate access + refresh tokens. */
export async function refreshCloverTokens(input: RefreshTokensInput): Promise<CloverTokenPair> {
  const hosts = resolveCloverHosts(input.credentials.environment, input.credentials.region);
  const url = `${httpsOrigin(hosts.apiHost)}/oauth/v2/refresh`;
  const raw = await postJson<CloverTokenResponse>(url, {
    client_id: input.credentials.appId,
    refresh_token: input.refreshToken,
  });
  return mapTokenResponse(raw);
}

/** True when access token expires within `skewSeconds` (default 60). */
export function isCloverAccessTokenExpired(
  tokens: CloverTokenPair,
  skewSeconds = 60,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return tokens.accessTokenExpiration - skewSeconds <= nowSec;
}
