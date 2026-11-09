import { PIXEL_ID_RE } from "@foundry/meta-pixel";

/**
 * Meta Pixel bootstrap: init only via Foundry would fire PageView without eventID,
 * which tanks Meta's event-coverage / dedupe diagnostics (PageView is most of volume).
 *
 * Here the first PageView after consent gets a UUID eventID and a same-origin CAPI beacon
 * with the same id. SPA navigations are handled by <MetaPageViews/> (disablePushState).
 */
export function metaPixelBootstrap(id: string | null): string {
  if (!id || !PIXEL_ID_RE.test(id)) return "";
  return `(function(){if(location.pathname.indexOf("/dashboard")===0)return;!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq.disablePushState=true;fbq("init","${id}");var k=location.pathname;if(window.__tgMetaPv!==k&&crypto.randomUUID){window.__tgMetaPv=k;var eid=crypto.randomUUID();fbq("track","PageView",{},{eventID:eid});try{var body=JSON.stringify({eventName:"PageView",eventId:eid,eventSourceUrl:location.href});if(navigator.sendBeacon){navigator.sendBeacon("/api/meta/events",new Blob([body],{type:"application/json"}));}else{fetch("/api/meta/events",{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:!0}).catch(function(){});}}catch(e){}}try{window.dispatchEvent(new Event("tg:meta-pixel-ready"));}catch(e){}})();`;
}
