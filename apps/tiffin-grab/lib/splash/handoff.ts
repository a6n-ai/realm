// The splash spans a full page load: the page being left shows it, and the page being opened keeps
// it up from its first paint until it is ready. The two pages share one short-lived flag: a cookie
// on the apex domain (so tiffingrab.ca and app.tiffingrab.ca both see it) or, on one host (local,
// previews), sessionStorage. The flag only ever lives for a few seconds.

export const SPLASH_FLAG = "tg_splash";
const TTL_S = 12;

/** The registrable apex of a TiffinGrab host, or null where cookies can't span hosts (localhost, IPs). */
export function apexOf(hostname: string): string | null {
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname) || !hostname.includes(".")) return null;
  return hostname.startsWith("app.") ? hostname.slice(4) : hostname.replace(/^www\./, "");
}

/** The Set-Cookie value that raises the flag for every host under `apex`. */
export function splashCookie(apex: string | null, secure: boolean): string {
  return `${SPLASH_FLAG}=1; Path=/; Max-Age=${TTL_S}; SameSite=Lax${apex ? `; Domain=.${apex}` : ""}${secure ? "; Secure" : ""}`;
}

/** Called by the page being left, just before it navigates away. */
export function raiseSplashFlag(): void {
  try { sessionStorage.setItem(SPLASH_FLAG, String(Date.now())); } catch { /* storage blocked: the cookie still carries it */ }
  document.cookie = splashCookie(apexOf(location.hostname), location.protocol === "https:");
}

/** Called by the page being opened, once it has shown the splash: drop the flag so a reload is clean. */
export function clearSplashFlag(): void {
  try { sessionStorage.removeItem(SPLASH_FLAG); } catch { /* nothing to clear */ }
  const apex = apexOf(location.hostname);
  document.cookie = `${SPLASH_FLAG}=; Path=/; Max-Age=0; SameSite=Lax${apex ? `; Domain=.${apex}` : ""}`;
}

// Runs in <head> before the body parses: if the flag is up, mark <html> so the server-rendered splash
// is visible on the very first paint, with no blank gap before React loads.
export const splashInitScript = `(function(){try{var f=document.cookie.indexOf("${SPLASH_FLAG}=1")>-1;var s=null;try{s=sessionStorage.getItem("${SPLASH_FLAG}")}catch(e){}if(f||(s&&Date.now()-Number(s)<${TTL_S * 1000}))document.documentElement.setAttribute("data-splash","arrive")}catch(e){}})();`;
