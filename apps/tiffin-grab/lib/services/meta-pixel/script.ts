import { PIXEL_ID_RE } from "./pixel-id";

// Meta's base code. disablePushState: route changes are tracked by <MetaPixelPageViews/>, so
// fbevents' own history listener would double-count. Staff pages are never tracked.
export function pixelScript(id: string | null): string {
  if (!id || !PIXEL_ID_RE.test(id)) return "";
  return `(function(){if(location.pathname.indexOf("/dashboard")===0)return;!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq.disablePushState=true;fbq("init","${id}");fbq("track","PageView");})();`;
}
