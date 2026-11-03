/** GA4 web stream ID. Interpolated into the browser bootstrap, so the shape is strict. */
export const GA_ID_RE = /^G-[A-Z0-9]{4,20}$/;

export function gaScript(id: string | null): string {
  if (!id || !GA_ID_RE.test(id)) return "";
  return `(function(){if(location.pathname.indexOf("/dashboard")===0)return;var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag("js",new Date());gtag("config","${id}");})();`;
}
