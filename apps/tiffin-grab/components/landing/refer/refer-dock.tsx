"use client";

import { useEffect, useState } from "react";
import { ReferCta } from "./refer-cta";

/** Phones: a "Get my link" bar above the site dock once the hero's CTA has scrolled away, hidden again while the
 *  closing CTA is on screen. */
export function ReferDock({ offer }: { offer: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const heroCta = document.querySelector("[data-rf-cta='hero']");
    const finalCta = document.querySelector("[data-rf-cta='final']");
    if (!heroCta) return;
    let past = false;
    let finalVisible = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === heroCta) {
          past = !e.isIntersecting && e.boundingClientRect.top < 0;
        } else {
          finalVisible = e.isIntersecting;
        }
      }
      setShow(past && !finalVisible);
    });
    io.observe(heroCta);
    if (finalCta) io.observe(finalCta);
    return () => io.disconnect();
  }, []);
  return (
    <div className="rf3-dock" data-show={show || undefined} aria-hidden={!show} inert={!show}>
      <span className="rf3-dock__offer">{offer}</span>
      <ReferCta />
    </div>
  );
}
