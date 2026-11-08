"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { TagFace } from "./friend-copy";

function Face({ face, back }: { face: TagFace; back?: boolean }) {
  return (
    <span className={back ? "rf3-tag__face rf3-tag__face--back" : "rf3-tag__face"} aria-hidden>
      <span className="rf3-tag__label">{face.label}</span>
      <strong className="rf3-tag__big" data-long={face.big.length > 4 || undefined}>{face.big}</strong>
      <span className="rf3-tag__small">{face.small}</span>
    </span>
  );
}

const say = (f: TagFace) => `${f.label.toLowerCase()}, ${f.big}, ${f.small}`;

/** A kraft luggage tag tied to the tiffin's lug: it sways on its cord and flips to show the other side's reward.
 *  `still` draws it hanging motionless with one face, as decoration. */
export function ReferTag({ faces, still = false }: { faces: TagFace[]; still?: boolean }) {
  const [front, back] = faces;
  const [flipped, setFlipped] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (still || !el) return;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-away", !e!.isIntersecting));
    io.observe(el.parentElement ?? el);
    return () => io.disconnect();
  }, [still]);
  if (!front) return null;
  // A mouse flips it on hover; touch and keyboard toggle it with a press.
  const hover = (on: boolean) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setFlipped(on);
  };
  return (
    <div ref={root} className="rf3-tag" data-still={still || undefined} aria-hidden={still || undefined}>
      <div className="rf3-tag__sway">
        {!still && back ? (
          <button
            type="button"
            className="rf3-tag__card"
            aria-pressed={flipped}
            aria-label={`Gift tag showing ${say(flipped ? back : front)}. Flip it for ${say(flipped ? front : back)}.`}
            onClick={() => setFlipped((f) => !f)}
            onPointerEnter={hover(true)}
            onPointerLeave={hover(false)}
          >
            <Face face={front} />
            <Face face={back} back />
          </button>
        ) : (
          <div className="rf3-tag__card" role={still ? undefined : "img"} aria-label={still ? undefined : `Gift tag: ${say(front)}`}>
            <Face face={front} />
          </div>
        )}
      </div>
      <svg className="rf3-tag__cord" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 0 C 14 46, 58 92, 100 100" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="rf3-tag__knot" aria-hidden />
      {!still && back ? <p className="rf3-tag__hint" aria-hidden>Tap the tag</p> : null}
    </div>
  );
}
