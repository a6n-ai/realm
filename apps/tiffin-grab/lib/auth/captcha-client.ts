// Browser side of Turnstile. Runs a fresh widget per protected request (tokens
// are single-use). Most visitors see nothing; a suspicious one gets a small
// checkbox pinned to the bottom of the screen until they tick it.
import { CAPTCHA_ENDPOINTS } from "./captcha";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let siteKey: Promise<string | null> | undefined;
let script: Promise<void> | undefined;

function loadSiteKey() {
  siteKey ??= fetch("/api/captcha")
    .then((r) => r.json() as Promise<{ siteKey: string | null }>)
    .then((d) => d.siteKey)
    .catch(() => {
      siteKey = undefined; // retry next time
      return null;
    });
  return siteKey;
}

function loadScript() {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = undefined;
      reject(new Error("Couldn't load the security check. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return script;
}

export function needsCaptcha(url: string | URL): boolean {
  const path = new URL(url, window.location.origin).pathname;
  return CAPTCHA_ENDPOINTS.some((e) => path.includes(e)) && !path.includes("/sign-in/email-otp");
}

/**
 * Where the checkbox shows if Cloudflare wants a human: right under the email
 * field of the form being submitted (every auth form has one), else pinned to
 * the bottom of the screen. display:contents keeps the host out of the form's
 * flex gap, so a visitor who passes silently sees no extra space.
 */
function placeHost(): HTMLElement {
  const host = document.createElement("div");
  // Safari doesn't focus a clicked button, so fall back to the page's email form.
  const form =
    document.activeElement?.closest("form") ?? document.querySelector('input[type="email"]')?.closest("form");
  const email = form?.querySelector<HTMLInputElement>('input[type="email"]');
  let row: Element | null | undefined = email;
  while (row && row.parentElement !== form) row = row.parentElement;
  if (row) {
    host.dataset.inline = "1";
    host.style.display = "contents";
    row.after(host);
  } else {
    host.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647";
    document.body.appendChild(host);
  }
  return host;
}

// Turnstile tokens live 300s; leave margin for the request itself.
const TOKEN_TTL_MS = 270_000;
let ready: { token: Promise<string | null>; at: number } | undefined;

/**
 * Do the slow parts (site key, script, challenge) before the click, so Send
 * only waits on its own request. `solve: false` warms key + script only — use it
 * on screens with no email form yet, where a checkbox would have nowhere to sit.
 */
export function warmCaptcha(solve = true): void {
  void loadSiteKey();
  void loadScript().catch(() => {});
  if (!solve || (ready && Date.now() - ready.at < TOKEN_TTL_MS)) return;
  const token = solveToken();
  token.catch(() => {
    if (ready?.token === token) ready = undefined;
  });
  ready = { token, at: Date.now() };
}

/** A single-use Turnstile token, or null when captcha is off. */
export async function getCaptchaToken(): Promise<string | null> {
  const pre = ready;
  ready = undefined;
  if (pre && Date.now() - pre.at < TOKEN_TTL_MS) {
    const token = await pre.token.catch(() => undefined);
    if (token !== undefined) return token;
  }
  return solveToken();
}

async function solveToken(): Promise<string | null> {
  const key = await loadSiteKey();
  if (!key) return null;
  await loadScript();
  const host = placeHost();
  let id: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      id = window.turnstile!.render(host, {
        sitekey: key,
        appearance: "interaction-only",
        size: host.dataset.inline ? "flexible" : "normal",
        callback: resolve,
        "error-callback": () => reject(new Error("Security check failed. Please try again.")),
        "expired-callback": () => reject(new Error("Security check expired. Please try again.")),
      });
    });
  } finally {
    if (id) window.turnstile?.remove(id);
    host.remove();
  }
}
