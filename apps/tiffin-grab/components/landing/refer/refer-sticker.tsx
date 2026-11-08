import type { OfferFigure } from "@/lib/referrals/offer";

// The circle (r 97) minus the bottom right segment between 15° and 75°; that segment is drawn folded back as the peel.
const BODY = "M125.1,193.7 A97,97 0 1,1 193.7,125.1 Z";
const FLAP = "M193.7,125.1 A97,97 0 0,0 125.1,193.7 Z";

/** The offer as a round die-cut sticker pinned on the tiffin's lid, its ring around the tiffin mark. */
export function ReferSticker({ friend, referrer }: { friend: OfferFigure | null; referrer: OfferFigure | null }) {
  const segment = [friend ? `Give ${friend.big}` : null, referrer ? `Get ${referrer.big}` : null].filter(Boolean).join(" ★ ") + " ★ ";
  // The ring holds about 40 characters at its size; a short phrase repeated reads cleaner than one stretched.
  const ring = segment.repeat(Math.max(1, Math.floor(40 / segment.length)));
  return (
    <div className="rf3-sticker" aria-hidden>
      <svg viewBox="0 0 200 200">
        <defs>
          <path id="rf3-sticker-ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
          <clipPath id="rf3-sticker-body"><path d={BODY} /></clipPath>
          <linearGradient id="rf3-sticker-flap" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#FFFDF8" />
            <stop offset="1" stopColor="#E6D6BC" />
          </linearGradient>
        </defs>
        <g clipPath="url(#rf3-sticker-body)">
          <circle cx="100" cy="100" r="97" fill="#FBF4E7" />
          <circle cx="100" cy="100" r="90" fill="#FF9843" />
          <g>
            <text className="rf3-sticker__ring"><textPath href="#rf3-sticker-ring" textLength="452" lengthAdjust="spacing">{ring.toUpperCase()}</textPath></text>
          </g>
          <circle cx="100" cy="100" r="54" fill="#FBF4E7" />
        </g>
        <image href="/brand/mark.svg" x="66" y="66" width="68" height="68" />
        <path d={FLAP} fill="rgb(20 16 12 / 0.22)" transform="translate(-4 -4)" />
        <path d={FLAP} fill="url(#rf3-sticker-flap)" />
      </svg>
    </div>
  );
}
