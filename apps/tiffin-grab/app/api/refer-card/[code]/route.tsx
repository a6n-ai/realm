import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";
import { friendOfferParts } from "@/lib/referrals/share";
import { getAppSettings, getReferralSettings } from "@/lib/services/app-settings.service";
import { findReferrerByCode } from "@/lib/services/referrals.service";
import { walletService } from "@/lib/services/wallet.service";

// Public (see PUBLIC_API in proxy.ts): WhatsApp and other link-preview crawlers fetch it with no cookie.
// The image shows the code, the public offer and the referrer's first name, nothing else about them.

// Standalone server.js chdirs to the app dir; next.config.ts traces assets/refer into the build.
const asset = (name: string) => readFile(path.join(process.cwd(), "assets/refer", name));
const assets = Promise.all([asset("Poppins-Bold.ttf"), asset("Poppins-Medium.ttf"), asset("tiffin.png"), asset("mark.png")]);
const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

const INK = "#2B211B";
const MUTED = "#6B5D52";
const SAFFRON = "#E8650F";
const GREEN = "#185936";

// Default is the phone image (4:5 portrait, fills a WhatsApp chat or an Instagram post).
// ?size=og is the 1200x630 landscape card that link previews crop to.
const LAYOUT = {
  phone: { width: 1080, height: 1350, pad: 72, logo: 84, brand: 44, chip: 30, lead: 50, big: 190, small: 34, label: 24, code: 80, url: 26, art: 820, text: 936 },
  og: { width: 1200, height: 630, pad: 60, logo: 56, brand: 30, chip: 20, lead: 36, big: 120, small: 24, label: 16, code: 46, url: 17, art: 640, text: 620 },
};

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code);
  if (!isReferralCodeShape(code)) return new Response("Not found", { status: 404 });
  const og = new URL(req.url).searchParams.get("size") === "og";
  const L = LAYOUT[og ? "og" : "phone"];

  const [referrer, [bold, medium, tiffin, mark], settings, { currency }] = await Promise.all([findReferrerByCode(code), assets, getReferralSettings(), getAppSettings()]);
  // No card for codes that don't belong to an active customer.
  if (!referrer) return new Response("Not found", { status: 404 });
  const perCoin = await walletService.activeRate(currency).catch(() => null);
  const offer = friendOfferParts(settings, perCoin == null ? null : { perCoin, currency });
  const who = referrer.firstName ?? "A friend";
  const host = new URL(process.env.SITE_URL ?? "https://app.tiffingrab.ca").host;
  const k = L.width / 1080;

  // Satori has no backdrop blur, so the glass is a bright translucent fill, a white rim and a warm
  // drop shadow over the glows and the art; it reads as Apple's material at share-image size.
  const glass = {
    background: "linear-gradient(145deg, rgba(255,255,255,0.92), rgba(255,255,255,0.62))",
    border: `${og ? 2 : 3}px solid rgba(255,255,255,0.95)`,
    boxShadow: `0 ${Math.round(30 * k)}px ${Math.round(70 * k)}px -${Math.round(24 * k)}px rgba(122,62,12,0.35)`,
  };

  const text = (
    <div style={{ display: "flex", flexDirection: "column", width: L.text, height: "100%", padding: `${L.pad}px 0 ${og ? L.pad : 0}px ${L.pad}px`, justifyContent: og ? "space-between" : "flex-start" }}>
      {/* Satori lays out every multi-child div as flex, so each line is its own block. */}
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(18 * k) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only */}
        <img src={dataUrl(mark)} width={L.logo} height={L.logo} alt="" />
        <div style={{ display: "flex", fontSize: L.brand, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#EF7A1A" }}>Tiffin</span>
          <span style={{ color: GREEN }}>Grab</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 64 }}>
        {/* The landscape card has no room for the chip; the name moves into the lead line. */}
        {og ? null : (
        <div style={{ ...glass, display: "flex", alignSelf: "flex-start", alignItems: "center", gap: Math.round(12 * k), padding: `${Math.round(12 * k)}px ${Math.round(26 * k)}px`, borderRadius: 999, fontSize: L.chip, fontWeight: 500, color: INK }}>
          <div style={{ width: Math.round(14 * k), height: Math.round(14 * k), borderRadius: 999, background: GREEN }} />
          {`${who} invited you`}
        </div>
        )}
        {offer ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : Math.round(32 * k) }}>
            <div style={{ fontSize: L.lead, fontWeight: 700, color: INK, letterSpacing: -1 }}>{og ? `${who} sent you` : "Your first plan comes with"}</div>
            <div style={{ fontSize: L.big, fontWeight: 700, color: SAFFRON, lineHeight: 1, letterSpacing: -L.big * 0.04, marginTop: Math.round(8 * k) }}>{offer.big}</div>
            <div style={{ fontSize: L.small, fontWeight: 500, color: MUTED, marginTop: Math.round(14 * k) }}>{offer.small}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: Math.round(32 * k), fontSize: L.big * 0.5, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            <div style={{ color: INK }}>Home-style tiffins,</div>
            <div style={{ color: SAFFRON }}>delivered.</div>
          </div>
        )}
      </div>

      <div style={{ ...glass, display: "flex", flexDirection: "column", alignSelf: "flex-start", marginTop: og ? 0 : 56, padding: `${Math.round(30 * k)}px ${Math.round(44 * k)}px`, borderRadius: Math.round(44 * k) }}>
        <div style={{ fontSize: L.label, fontWeight: 700, color: MUTED, letterSpacing: L.label * 0.18 }}>USE CODE</div>
        <div style={{ fontSize: L.code, fontWeight: 700, color: GREEN, letterSpacing: L.code * 0.14, lineHeight: 1.1, marginTop: Math.round(6 * k) }}>{code}</div>
        <div style={{ fontSize: L.url, fontWeight: 500, color: MUTED, marginTop: Math.round(10 * k) }}>{`Sign up at ${host}`}</div>
      </div>
    </div>
  );

  const artHeight = Math.round((L.art * 630) / 640);
  const art = (
    // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only
    <img src={dataUrl(tiffin)} width={L.art} height={artHeight} style={{ position: "absolute", right: og ? -10 : -40, bottom: og ? -6 : -30 }} alt="" />
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          fontFamily: "Poppins",
          color: INK,
          backgroundColor: "#FBF4E7",
          backgroundImage: "radial-gradient(circle at 88% 6%, rgba(239,122,26,0.30), rgba(239,122,26,0) 46%), radial-gradient(circle at 4% 100%, rgba(24,89,54,0.20), rgba(24,89,54,0) 52%)",
        }}
      >
        {/* Earlier siblings paint first: the art sits behind the glass so the card reads as a layer over it. */}
        {art}
        {text}
      </div>
    ),
    {
      width: L.width,
      height: L.height,
      fonts: [
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
        { name: "Poppins", data: medium, weight: 500, style: "normal" },
      ],
      // Offer settings change rarely; an hour keeps crawlers and the share sheet fast.
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
