import { PIXEL_ID_RE } from "@foundry/meta-pixel";
import { META_EXTERNAL_ID_COOKIE } from "./external-id";

/**
 * Meta Pixel bootstrap. Foundry's base snippet fires PageView with no eventID,
 * which leaves Events Manager at 0% event coverage (PageView is most of the volume).
 *
 * After consent this script:
 * - turns off automatic events (they have no event_id and no Conversions API pair)
 * - mints one first-party external_id and passes it to fbq init (raw; CAPI hashes the same cookie)
 * - fires PageView with eventID
 * - beacons the same event_id to /api/meta/events, waiting briefly for _fbp so the
 *   server event carries that dedupe key too (flushed on pagehide if the visitor leaves)
 *
 * SPA navigations are <MetaPageViews/> (disablePushState).
 */
export function metaPixelBootstrap(id: string | null): string {
  if (!id || !PIXEL_ID_RE.test(id)) return "";
  const cookie = META_EXTERNAL_ID_COOKIE;
  return `(function(){if(location.pathname.indexOf("/dashboard")===0)return;!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq.disablePushState=true;fbq("set","autoConfig",false,"${id}");var ext=(function(){var m=document.cookie.match(/(?:^|; )${cookie}=([^;]*)/);var xid=m?decodeURIComponent(m[1]):"";if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(xid))xid=(crypto.randomUUID&&crypto.randomUUID())||"";if(!xid)return"";var h=location.hostname,domain="";if(h.indexOf(".")>0&&!/^[\\d.]+$/.test(h)){var site=h.split(".").slice(-2).join(".");if(!/^(trycloudflare\\.com|workers\\.dev|pages\\.dev|vercel\\.app|github\\.io)$/.test(site))domain="; Domain=."+site}var secure=location.protocol==="https:"?"; Secure":"";document.cookie="${cookie}="+xid+"; Max-Age=31536000; Path=/; SameSite=Lax"+domain+secure;return xid})();fbq("init","${id}",ext?{external_id:ext}:{});var k=location.pathname;if(window.__tgMetaPv!==k&&crypto.randomUUID){window.__tgMetaPv=k;var eid=crypto.randomUUID();fbq("track","PageView",{},{eventID:eid});var sent=false;var send=function(){if(sent)return;sent=true;try{var body=JSON.stringify({eventName:"PageView",eventId:eid,eventSourceUrl:location.href});if(!(navigator.sendBeacon&&navigator.sendBeacon("/api/meta/events",new Blob([body],{type:"application/json"}))))fetch("/api/meta/events",{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:true}).catch(function(){})}catch(err){}};if(document.cookie.indexOf("_fbp=")!==-1)send();else{var n=0,timer=setInterval(function(){if(document.cookie.indexOf("_fbp=")!==-1||++n>=15){clearInterval(timer);send()}},100);addEventListener("pagehide",function(){clearInterval(timer);send()})}}try{window.dispatchEvent(new Event("tg:meta-pixel-ready"))}catch(err){}})();`;
}
