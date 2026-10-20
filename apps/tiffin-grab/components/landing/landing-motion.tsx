"use client";

import { useEffect } from "react";
import { TIFFIN_EY, TIFFIN_EZ, TIFFIN_CAL_HINGE, TIFFIN_LID_GAP, TIFFIN_SPREAD, TIFFIN_SRC, TIFFIN_TIERS } from "./tiffin-art.generated";

// The story the figure tells, one state per chapter (data-step on each chapter):
// packed and steaming, then cooked, packed tier by tier, sides added, closed, and at
// the end latched and steaming, ready for delivery.
type State = { spread: number; lid: number; fill: number[]; steam: number; active: string[]; read: string };
const ALL = [1, 1, 1, 1];
const TIERS = ["tier0", "tier1", "tier2", "tier3"];
const STORY: State[] = [
  { spread: 0, lid: 0, fill: ALL, steam: 1, active: ["lid"], read: "Packed" },
  { spread: 0, lid: 0, fill: [0, 0, 0, 0], steam: 0, active: ["prep"], read: "In the kitchen" },
  { spread: 1, lid: 1, fill: [1, 1, 0, 0], steam: 0, active: ["tier0", "tier1"], read: "Jeera Rice, Tur Dal" },
  { spread: 1, lid: 1, fill: ALL, steam: 0, active: ["tier2", "tier3"], read: "Palak Paneer, Roti" },
  { spread: 1, lid: 1, fill: ALL, steam: 0, active: ["side-raita", "side-salad"], read: "Boondi Raita, Kachumber Salad" },
  { spread: 0, lid: 0.5, fill: ALL, steam: 0, active: TIERS, read: "Tiers closed" },
  { spread: 0, lid: 0, fill: ALL, steam: 1, active: ["lid"], read: "Ready for delivery" },
];

// One driver for the page: Lenis on GSAP's ticker, the figure fetched into its
// card, and each chapter tweening the figure to its state. Reduced motion keeps
// native scroll and lands every state at once.
export function LandingMotion() {
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("lenis"),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!reduced) {
        const lenis = new Lenis({ lerp: 0.12, anchors: true });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        cleanups.push(() => { gsap.ticker.remove(tick); lenis.destroy(); });
      }

      const stage = document.querySelector<HTMLElement>("[data-tiffin-stage]");
      const readout = document.querySelector<HTMLElement>("[data-tiffin-readout]");
      const stepLabel = document.querySelector<HTMLElement>("[data-tiffin-step]");
      if (!stage) return;
      const markup = await fetch(TIFFIN_SRC).then((r) => (r.ok ? r.text() : "")).catch(() => "");
      if (disposed || !markup) return;
      // Our own build output, served from /public: trusted markup, not user content.
      stage.innerHTML = markup;
      cleanups.push(() => { stage.innerHTML = ""; });

      const part = (name: string) => stage.querySelector<SVGGElement>(`[data-part="${name}"]`);
      const tiers = TIERS.slice(0, TIFFIN_TIERS).map(part);
      const lid = part("lid");
      const steam = part("steam");
      const foods = Array.from({ length: TIFFIN_TIERS }, (_, i) => stage.querySelector<SVGGElement>(`[data-food="${i}"]`));
      const parts = [...stage.querySelectorAll<SVGGElement>("[data-part]")];

      // The live pose, tweened as one object so every part moves on the same clock.
      const now = { spread: 0, lid: 0, steam: 1, f0: 1, f1: 1, f2: 1, f3: 1 };
      const up = (z: number) => `translate(${(TIFFIN_EZ[0] * z).toFixed(2)} ${(TIFFIN_EZ[1] * z).toFixed(2)})`;
      const draw = () => {
        tiers.forEach((t, i) => t?.setAttribute("transform", up(i * TIFFIN_SPREAD * now.spread)));
        lid?.setAttribute("transform", up((TIFFIN_TIERS - 1) * TIFFIN_SPREAD * now.spread + TIFFIN_LID_GAP * now.lid));
        if (steam) steam.style.opacity = String(now.steam);
        foods.forEach((f, i) => {
          const v = now[`f${i}` as "f0"];
          if (!f) return;
          f.style.opacity = String(v);
          f.setAttribute("transform", `translate(0 ${((1 - v) * 10).toFixed(2)})`);
        });
      };
      draw();

      const go = (i: number) => {
        const s = STORY[i];
        if (!s) return;
        // Days light from the delivery-days step on, and go dark again above it.
        showDays(i >= 5 ? pickedDays() : []);
        if (i === 6) queueMicrotask(() => playWeeks(pickedWeeks()));
        else { weeksRun?.kill(); weeksRun = null; setRows(4); }
        parts.forEach((p) => p.setAttribute("data-active", String(s.active.includes(p.dataset.part ?? ""))));
        if (readout) readout.textContent = s.read;
        if (stepLabel) stepLabel.textContent = `Step ${i + 1} of ${STORY.length}`;
        const to = { spread: s.spread, lid: s.lid, steam: s.steam, f0: s.fill[0], f1: s.fill[1], f2: s.fill[2], f3: s.fill[3] };
        gsap.to(now, { ...to, duration: reduced ? 0 : 0.9, ease: "power3.inOut", overwrite: true, onUpdate: draw });
      };
      // Calendar columns: the picked frequency's days step out of the page and light, Monday first.
      const tiles = [...stage.querySelectorAll<SVGGElement>("[data-day]")];
      const lift = (on: boolean) => (on ? `translate(${(TIFFIN_EY[0] * 1.4).toFixed(2)} ${(TIFFIN_EY[1] * 1.4).toFixed(2)})` : "translate(0 0)");
      const showDays = (days: string[]) => {
        tiles.forEach((t, i) => {
          const on = days.includes(t.dataset.day ?? "");
          if ((t.dataset.on === "true") === on) return;
          gsap.delayedCall(reduced ? 0 : i * 0.07, () => { t.dataset.on = String(on); t.setAttribute("transform", lift(on)); });
        });
      };
      // Calendar weeks: from the plan-length step on, rows fill one week at a time; past
      // four weeks the page turns and keeps filling, and the readout counts the weeks.
      const rows = Array.from({ length: 4 }, (_, r) => [...stage.querySelectorAll<SVGGElement>(`[data-week="${r}"]`)]);
      const setRows = (lit: number) => rows.forEach((cells, r) => cells.forEach((c) => (c.dataset.off = String(r >= lit))));
      let weeksRun: { kill: () => void } | null = null;
      // A month turning: the page folds up over the binder rings and a fresh one drops.
      // The fold squashes every point toward the slanted top edge, an affine map.
      const page = stage.querySelector<SVGGElement>("[data-cal-page]");
      const [hx0, hy0, hx1, hy1] = TIFFIN_CAL_HINGE;
      const slope = (hy1 - hy0) / (hx1 - hx0), cut = hy0 - slope * hx0;
      const fold = { s: 1 };
      const applyFold = () => page?.setAttribute("transform", `matrix(1 ${((1 - fold.s) * slope).toFixed(4)} 0 ${fold.s.toFixed(4)} 0 ${((1 - fold.s) * cut).toFixed(2)})`);
      const pickedWeeks = () => Number(document.querySelector<HTMLElement>('[data-weeks][aria-checked="true"]')?.dataset.weeks ?? 0);
      const playWeeks = (n: number) => {
        weeksRun?.kill();
        weeksRun = null;
        fold.s = 1;
        applyFold();
        if (!n) return setRows(4);
        if (reduced) { setRows(Math.min(n, 4)); if (readout) readout.textContent = `${n} ${n === 1 ? "week" : "weeks"}`; return; }
        const tl = gsap.timeline();
        setRows(0);
        for (let w = 0; w < n; w++) {
          const row = w % 4;
          if (row === 0 && w > 0) {
            tl.to(fold, { s: 0, duration: 0.3, ease: "power2.in", onUpdate: applyFold }, "+=0.4");
            tl.call(() => setRows(0));
            tl.to(fold, { s: 1, duration: 0.36, ease: "power2.out", onUpdate: applyFold });
          }
          tl.call(() => { setRows(row + 1); if (readout) readout.textContent = `Week ${w + 1}`; }, [], w === 0 ? 0.2 : "+=0.26");
        }
        tl.call(() => { if (readout) readout.textContent = `${n} ${n === 1 ? "week" : "weeks"}, ready for delivery`; }, [], "+=0.5");
        weeksRun = tl;
      };
      const onWeeks = (e: Event) => { if (current === 6) playWeeks((e as CustomEvent<number>).detail); };
      addEventListener("tg:weeks", onWeeks);
      cleanups.push(() => { removeEventListener("tg:weeks", onWeeks); weeksRun?.kill(); });
      const pickedDays = () => (document.querySelector<HTMLElement>('[data-freq][aria-checked="true"]')?.dataset.freq ?? "").split(",").filter(Boolean);
      const onDays = (e: Event) => showDays((e as CustomEvent<string[]>).detail);
      addEventListener("tg:days", onDays);
      cleanups.push(() => removeEventListener("tg:days", onDays));
      go(0);

      // The step is the last chapter whose top has passed the reading line: mid-screen on
      // desktop, the upper part of the reading strip under the sticky figure on phones. Read on every scroll update, so a
      // fast jump past several chapters still lands on the right one.
      const steps = [...document.querySelectorAll<HTMLElement>("[data-step]")];
      const plate = stage.closest<HTMLElement>(".tg-story__stage");
      let current = 0;
      const sync = () => {
        const below = plate?.getBoundingClientRect().bottom ?? 0;
        // Phones: a third of the way down the strip of page left under the figure.
        const line = matchMedia("(max-width: 900px)").matches && plate ? below + (innerHeight - below) * 0.35 : innerHeight * 0.55;
        let next = 0;
        for (const el of steps) if (el.getBoundingClientRect().top < line) next = Number(el.dataset.step);
        if (next !== current) { current = next; go(next); }
      };
      const story = document.querySelector<HTMLElement>(".tg-story");
      const trigger = ScrollTrigger.create({ trigger: story ?? document.body, start: "top bottom", end: "bottom top", onUpdate: sync, onRefresh: sync });
      cleanups.push(() => trigger.kill());
      ScrollTrigger.refresh();
    })();

    return () => {
      disposed = true;
      cleanups.reverse().forEach((fn) => fn());
    };
  }, []);

  return null;
}
