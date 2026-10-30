import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";
import { friendOffer } from "@/lib/referrals/share";
import { getAppSettings, getReferralSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";

// Public (see PUBLIC_API in proxy.ts): WhatsApp and other link-preview crawlers fetch it with no cookie.
// The image shows only the code from the URL and the public offer, nothing about the referrer.

// Standalone server.js chdirs to the app dir; next.config.ts traces assets/refer into the build.
const asset = (name: string) => readFile(path.join(process.cwd(), "assets/refer", name));
const assets = Promise.all([asset("Poppins-Bold.ttf"), asset("Poppins-Medium.ttf"), asset("tiffin.png")]);

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code);
  if (!isReferralCodeShape(code)) return new Response("Not found", { status: 404 });

  const [[bold, medium, tiffin], settings, { currency }] = await Promise.all([assets, getReferralSettings(), getAppSettings()]);
  const perCoin = await walletService.activeRate(currency).catch(() => null);
  const offer = friendOffer(settings, perCoin == null ? null : { perCoin, currency });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FBF4E7", fontFamily: "Poppins", color: "#2B211B" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 640, padding: "0 0 0 72px" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
            <span style={{ color: "#EF7A1A" }}>Tiffin</span>
            <span style={{ color: "#185936" }}>Grab</span>
          </div>
          {/* Satori lays out every multi-child div as flex, so each line is its own block. */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 24, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.2 }}>
            <div style={{ fontSize: 58 }}>{offer ? "A friend sent you" : "Home-style food,"}</div>
            <div style={{ fontSize: offer ? 46 : 58, color: "#B9471A", marginTop: 6 }}>{offer ? `${offer}.` : "from a friend."}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#6B5D52" }}>Use code</span>
            <span
              style={{
                display: "flex",
                alignSelf: "flex-start",
                marginTop: 8,
                padding: "10px 28px 10px 36px",
                border: "3px dashed #185936",
                borderRadius: 18,
                background: "#FFFFFF",
                fontSize: 48,
                fontWeight: 700,
                letterSpacing: 8,
                color: "#185936",
              }}
            >
              {code}
            </span>
          </div>
          <span style={{ marginTop: 32, fontSize: 22, fontWeight: 500, color: "#6B5D52" }}>Tiffin delivery across the GTA</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only */}
        <img src={`data:image/png;base64,${tiffin.toString("base64")}`} width={560} height={569} style={{ marginTop: 61 }} alt="" />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
        { name: "Poppins", data: medium, weight: 500, style: "normal" },
      ],
      // Offer settings change rarely; an hour keeps crawlers and the share sheet fast.
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
