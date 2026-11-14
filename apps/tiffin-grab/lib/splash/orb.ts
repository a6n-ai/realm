// The splash orb: a dotted sphere that turns slowly, then gathers into the icon of each step of an
// order (kitchen, cooking, tracking, delivery), holds, and melts back, looping until the page is ready.
// The word under the icon is real text (never drawn in dots, which jittered against the crisp copy).
// Canvas 2D only; transform-free; one requestAnimationFrame loop that stops when stopped.

export type SplashStep = { word: string; color: string; icon: string[] };

// Lucide icon paths (the app's icon set): ChefHat, CookingPot, MapPinned, ShoppingBag.
export const SPLASH_STEPS: SplashStep[] = [
  { word: "Kitchen", color: "--tg-s1", icon: ["M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z", "M6 17h12"] },
  { word: "Cooking", color: "--tg-s2", icon: ["M2 12h20", "M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", "m4 8 16-4", "m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8"] },
  { word: "Tracking", color: "--tg-s3", icon: ["M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0", "M14 8a2 2 0 1 1-4 0a2 2 0 1 1 4 0", "M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"] },
  { word: "Delivery", color: "--tg-s4", icon: ["M16 10a4 4 0 0 1-8 0", "M3.103 6.034h17.794", "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"] },
];

// one beat per step: orb, gather, hold, melt back
const ORB = 1400, IN = 450, HOLD = 700, OUT = 600, BEAT = ORB + IN + HOLD + OUT, N = 760;

const bezier = (x1: number, y1: number, x2: number, y2: number) => (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3; if (x < t) lo = u; else hi = u; }
  return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
};
// gather: strong in-out; melt back: strong ease-out, so it moves the instant the hold ends
const inOut = bezier(0.77, 0, 0.175, 1), easeOut = bezier(0.23, 1, 0.32, 1);
const smooth = (a: number, b: number, x: number) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

type RGB = [number, number, number];
const rgbOf = (css: string): RGB => {
  const x = document.createElement("canvas").getContext("2d");
  if (!x) return [24, 89, 54];
  x.fillStyle = css;
  const h = x.fillStyle;
  return h.startsWith("#") ? ([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB) : ((h.match(/[\d.]+/g) ?? ["24", "89", "54"]).slice(0, 3).map(Number) as RGB);
};
const mix = (a: RGB, b: RGB, k: number) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;

/** Starts the orb on `canvas`, writing the current step's word into `wordEl`. Returns a stop function. */
export function startOrb(canvas: HTMLCanvasElement, wordEl: HTMLElement, reduceMotion: boolean): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const style = getComputedStyle(canvas);
  const ink = rgbOf(style.getPropertyValue("--tg-orb-ink").trim() || "#185936");
  const stepRGB = SPLASH_STEPS.map((s) => rgbOf(style.getPropertyValue(s.color).trim() || "#fb801c"));
  const sphere = Array.from({ length: N }, (_, i) => { const y = 1 - ((i + 0.5) * 2) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; return [Math.cos(a) * r, y, Math.sin(a) * r] as const; });
  let W = 0, H = 0, targets: [number, number][][] = [];

  const setup = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), box = canvas.getBoundingClientRect();
    W = box.width; H = box.height;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // each step: stroke its icon the way lucide draws it, then sample N dots inside the stroke
    targets = SPLASH_STEPS.map((s) => {
      const G = 2, w = Math.round(W * G), h = Math.round(H * G), off = document.createElement("canvas");
      off.width = w; off.height = h;
      const o = off.getContext("2d");
      if (!o) return [];
      const ic = h * 0.56, k = ic / 24;
      o.translate(w / 2 - ic / 2, h * 0.06); o.scale(k, k);
      o.lineWidth = 2.1; o.lineCap = "round"; o.lineJoin = "round"; o.strokeStyle = "#000";
      for (const d of s.icon) o.stroke(new Path2D(d));
      const px = o.getImageData(0, 0, w, h).data, pool: [number, number][] = [];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (px[(y * w + x) * 4 + 3] > 140) pool.push([x / G, y / G]);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const pick = Array.from({ length: N }, (_, i) => pool[i % pool.length] ?? [W / 2, H / 2]);
      // pair dots and targets in angle order, so each dot travels a short arc
      const ang = (p: [number, number]) => Math.atan2(p[1] - H / 2, p[0] - W / 2);
      const order = sphere.map((p, i) => [Math.atan2(p[1], p[0]), i] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      const sorted = [...pick].sort((a, b) => ang(a) - ang(b)), paired: [number, number][] = [];
      order.forEach((si, k2) => (paired[si] = sorted[k2]));
      return paired;
    });
  };

  const draw = (t: number, m: number, si: number) => {
    ctx.clearRect(0, 0, W, H);
    const tg = targets[si];
    if (!tg?.length) m = 0;
    const col = stepRGB[si], R = Math.min(W, H) * 0.46 * (1 + 0.035 * Math.sin(t * 2.4));
    const ay = t * 0.7, ax = 0.42, cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax), base = Math.min(W, H);
    const pts = sphere.map(([x, y, z], i) => {
      const X = x * cy + z * sy, Z0 = -x * sy + z * cy, Y = y * cx - Z0 * sx, Z = y * sx + Z0 * cx;
      const band = Math.max(0, 1 - Math.abs((y + 1) / 2 - (((t * 0.45) % 1.3) - 0.15)) * 6), p = tg?.[i] ?? [W / 2, H / 2];
      return { x: W / 2 + X * R * (1 - m) + (p[0] - W / 2) * m, y: H / 2 + Y * R * (1 - m) + (p[1] - H / 2) * m, z: Z, d: (Z + 1) / 2, band };
    });
    // painter's order from the sphere's own depth: stable through the morph, so overlaps never flicker
    pts.sort((a, b) => a.z - b.z);
    for (const q of pts) {
      ctx.globalAlpha = (0.3 + 0.7 * q.d) * (1 - m) + m;
      ctx.fillStyle = mix(ink, col, Math.max(smooth(0.05, 0.6, m), smooth(0.2, 0.6, q.band)));
      const r = (base / 130) * (0.55 + 0.75 * q.d) * (1 - m) + (base / 150) * m;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  setup();
  addEventListener("resize", setup);
  const word = (si: number, w: number) => {
    const s = SPLASH_STEPS[si];
    if (wordEl.textContent !== s.word) wordEl.textContent = s.word;
    wordEl.style.color = `var(${s.color})`;
    wordEl.style.opacity = w.toFixed(3);
    wordEl.style.filter = `blur(${((1 - w) * 4).toFixed(2)}px)`;
    wordEl.style.transform = `translateY(${((1 - w) * 6).toFixed(2)}px)`;
  };
  if (reduceMotion) { draw(0, 1, 0); word(0, 1); return () => removeEventListener("resize", setup); }

  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    // the first frame's timestamp can come in a hair before t0 was read: never let time run negative
    const el = Math.max(0, now - t0), si = Math.floor(el / BEAT) % SPLASH_STEPS.length, at = el % BEAT;
    const m = at < ORB ? 0 : at < ORB + IN ? inOut((at - ORB) / IN) : at < ORB + IN + HOLD ? 1 : 1 - easeOut((at - ORB - IN - HOLD) / OUT);
    draw(el / 1000, m, si);
    word(si, smooth(0.55, 1, m));
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", setup); };
}
