"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function MarketingMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const heroLines = root.querySelectorAll(".xpl-hero-title > span");
        if (heroLines.length) {
          gsap.from(heroLines, {
            y: 20,
            opacity: 0,
            duration: 0.7,
            stagger: 0.09,
            ease: "power2.out",
          });
          const polaroids = root.querySelectorAll(".xpl-obj");
          gsap.from(polaroids, {
            y: 16,
            opacity: 0,
            duration: 0.55,
            stagger: 0.07,
            delay: 0.16,
            ease: "power2.out",
            onComplete: () => {
              gsap.set(polaroids, { clearProps: "transform" });
            },
          });
        } else {
          const intro = root.querySelector(":scope > header, :scope > article > header");
          if (intro) {
            gsap.from(intro, {
              y: 16,
              opacity: 0,
              duration: 0.5,
              ease: "power2.out",
            });
          }
        }

        gsap.utils.toArray<HTMLElement>(root.querySelectorAll(":scope > section, :scope > article > section")).forEach((section) => {
          const bits = section.querySelectorAll(":scope > *");
          if (!bits.length) return;
          gsap.from(bits, {
            y: 24,
            opacity: 0,
            duration: 0.65,
            stagger: 0.07,
            ease: "power2.out",
            scrollTrigger: {
              trigger: section,
              start: "top 84%",
              once: true,
            },
          });
        });

        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener("load", refresh);
        requestAnimationFrame(refresh);
        return () => window.removeEventListener("load", refresh);
      });

      return () => mm.revert();
    },
    { scope, dependencies: [pathname], revertOnUpdate: true },
  );

  return <div ref={scope}>{children}</div>;
}
