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

/** A single-use Turnstile token, or null when captcha is off. */
export async function getCaptchaToken(): Promise<string | null> {
  const key = await loadSiteKey();
  if (!key) return null;
  await loadScript();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647";
  document.body.appendChild(host);
  let id: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      id = window.turnstile!.render(host, {
        sitekey: key,
        appearance: "interaction-only",
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
