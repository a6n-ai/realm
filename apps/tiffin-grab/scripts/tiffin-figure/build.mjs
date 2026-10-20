// Builds the landing page's tiffin figure: the Tiffin Grab mark as a real steel
// tiffin on a bamboo mat, with the morning's cooking on a prep board behind it,
// two steel katoris of sides and the mark's orange spoon in front. Every part the
// page moves or lights carries data-part / data-food, painted in a fixed order.
// Writes components/landing/tiffin-art.generated.ts; --preview writes a static
// page for the anatomy skill's capture and line checks.
//   node scripts/tiffin-figure/build.mjs [--preview <out.html> [--light] [--state packed|open]]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../components/landing/tiffin-art.generated.ts");
const SVG_OUT = join(HERE, "../../public/landing/tiffin-figure.svg");
const STATIC_OUT = join(HERE, "../../public/landing/tiffin-figure-static.svg");

const WIDTH = 720;
const HEIGHT = 640;

// World units are about a millimetre.
const R = 40; // tier body radius
const FOOT = 3; // the narrower foot each tier nests on the one below with
const BODY = 26;
const LIP = 2;
const TIER = FOOT + BODY + LIP;
const PITCH = TIER - FOOT; // where the next tier's foot sits, inside this one's rim
const MOUTH = R - 1.6;
const TIERS = 4;
const SPREAD = 15; // the widest any joint opens
const LID_GAP = 36; // the lid held clear while the tiers are packed

const MAT = { x: -80, y: -72, w: 200, d: 170, r: 7 };
const MAT_H = 1.8;
const BOARD = { x: -206, y: -60, w: 104, d: 118, r: 6 };
const BOARD_H = 5;

// A steel thali under the stack.
const PLATE_R = 60;
const PLATE_H = 3.2;
const BASE = PLATE_H; // the stack stands on the thali
const LID_Z = BASE + TIERS * PITCH;

const LID = { skirt: 9, shoulder: 2.2, dome: 5, cap: 2.4, stem: 3, knob: 5.5 };
const LID_TOP = FOOT + LID.skirt + LID.shoulder + LID.dome + LID.cap + LID.stem + LID.knob;
const TOP_OPEN = LID_Z + LID_TOP + (TIERS - 1) * SPREAD + LID_GAP;

const P = k.fitProjection(
  [...k.boxCorners(MAT, -MAT_H, 0), ...k.boxCorners(BOARD, -BOARD_H, 0), [37, -70, 78], [119, -58, 78], [0, 0, TOP_OPEN + 14], [R + 10, -R - 10, 0], [-R - 10, R + 10, 0]],
  WIDTH,
  HEIGHT,
  { pad: 10, azimuth: 45, elevation: 30 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const g = (cls, body) => `<g class="${cls}">${body}</g>`;
const cylAt = (x, y, r, z, h, steps = 72, bevel = 0) => k.cylinder(x, y, r, z, h, P, steps, bevel);
const cyl = (r, z, h, steps = 72, bevel = 0) => cylAt(0, 0, r, z, h, steps, bevel);
const byDepth = (items) => [...items].sort((a, b) => k.depthOf([a.x, a.y, 0], P) - k.depthOf([b.x, b.y, 0], P));

// Seeded so the art is the same on every build.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const scatter = (cx, cy, radius, count, z) => {
  const out = [];
  while (out.length < count) {
    const x = (rand() * 2 - 1) * radius, y = (rand() * 2 - 1) * radius;
    if (x * x + y * y < radius * radius) out.push(at([cx + x, cy + y, z]));
  }
  return out;
};

// Across the screen from the viewer: +SIDE is screen right, -SIDE screen left.
const SIDE = [Math.SQRT1_2, -Math.SQRT1_2];

function steam(x, y, z, height, gap, tone = "mid") {
  const lines = [];
  for (const [off, phase] of [[-gap, 0], [gap, 1.6]]) {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const sway = Math.sin(t * Math.PI * 2 + phase) * 3.2 * (0.4 + t);
      pts.push(at([x + SIDE[0] * (off + sway), y + SIDE[1] * (off + sway), z + 4 + t * height]));
    }
    lines.push(k.fadeLineSvg(pts, { fade: [10, 24], tone }));
  }
  return `<g class="tf-steam">${lines.join("")}</g>`;
}

// ── The mat ──────────────────────────────────────────────────────────────
function mat() {
  const out = [`<path class="iso-halo" d="${k.haloOf(MAT, -MAT_H, MAT_H, P)}"/>`];
  out.push(g("tf-mat", S(k.slabOf(MAT, -MAT_H, MAT_H, P, 6, 0.6), { tone: "mid" })));
  const slats = [];
  for (let y = MAT.y + 7; y < MAT.y + MAT.d - 4; y += 7) slats.push(k.lineOnTop([MAT.x, y], [MAT.x + MAT.w, y], 0, P));
  out.push(g("tf-mat", L(slats.join(""), { tone: "lo" })));
  out.push(g("tf-mat", L(k.planOutline(k.insetPlan(MAT, 3), 0, P, 6), { tone: "mid" })));
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -R, y: -R, w: 2 * R, d: 2 * R, r: R }, 0, 2, P)}" style="opacity:.45"/>`);
  return out.join("");
}

// ── The prep board: what was cooked this morning ─────────────────────────
function board() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BOARD, -BOARD_H, BOARD_H, P)}"/>`];
  out.push(g("tf-wood", S(k.slabOf(BOARD, -BOARD_H, BOARD_H, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(BOARD, -BOARD_H / 2, P, 6), { tone: "faint" }) })));
  const grain = [];
  for (let x = BOARD.x + 9; x < BOARD.x + BOARD.w - 5; x += 9) grain.push(k.lineOnTop([x, BOARD.y], [x, BOARD.y + BOARD.d], 0, P));
  out.push(g("tf-wood", L(grain.join(""), { tone: "faint" })));

  out.push(stove());
  const items = [
    { x: BURNERS[0].x, y: BURNERS[0].y, draw: (x, y) => onBurner(BURNERS[0], handi(x, y)) },
    { x: BURNERS[1].x, y: BURNERS[1].y, draw: (x, y) => onBurner(BURNERS[1], patila(x, y)) },
    { x: -164, y: 28, draw: dabba },
  ];
  for (const item of byDepth(items)) out.push(item.draw(item.x, item.y));
  return `<g data-part="prep">${out.join("")}</g>`;
}

// The dal handi: a stepped round pot, dal at the brim, a ladle resting in it.
// A two-burner gas stove on the board: a dark steel body with two knobs on its front,
// pan supports round each burner, the dal handi and the rice patila cooking on them.
const STOVE = { x: -202, y: -54, w: 92, d: 50, r: 3 };
const STOVE_H = 7;
const BURNERS = [{ x: -178, y: -29, r: 17, foot: 12, head: 8.5 }, { x: -134, y: -29, r: 14, foot: 12, head: 7.5 }];
const SUPPORT = 4; // pots stand this high on the pan supports, flames in the gap below
function stove() {
  const out = [`<path class="iso-halo" d="${k.haloOf(STOVE, 0, 1, P)}" style="opacity:.55"/>`];
  out.push(g("tf-stove", S(k.slabOf(STOVE, 0, STOVE_H, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(STOVE, STOVE_H / 2, P, 4), { tone: "faint" }) })));
  // Glass top with a steel trim inset from the edge, and a drip ring round each burner.
  out.push(g("tf-stove", L(k.planOutline(k.insetPlan(STOVE, 2.5), STOVE_H, P, 4), { tone: "lo" })));
  for (const b of BURNERS) {
    out.push(g("tf-stove", L(k.ring(b.x, b.y, b.r + 3, STOVE_H, P, 48), { tone: "lo" })));
    out.push(g("tf-stove-tray", `<path class="iso-fill" d="${k.ring(b.x, b.y, b.head + 3.5, STOVE_H, P, 48)}"/>`));
    // The burner: a brass flame ring under a black cap.
    out.push(g("tf-brass", S(cylAt(b.x, b.y, b.head, STOVE_H, 1.6, 40, 0.2), { tone: "mid", inner: L(k.sideArc(b.x, b.y, b.head, STOVE_H + 0.8, P, 24), { tone: "lo" }) })));
    out.push(g("tf-stove-burner", S(cylAt(b.x, b.y, b.head - 2.6, STOVE_H + 1.6, 1.2, 32, 0.2), { tone: "mid" })));
  }
  // Two knobs on the front face, each with its pointer, and the ignition button between them.
  const front = STOVE.y + STOVE.d;
  for (const b of BURNERS) {
    out.push(g("tf-stove-knob", S(k.slabOf({ x: b.x - 3.4, y: front, w: 6.8, d: 2.6, r: 2.6 }, 1.4, 4.2, P, 6, 0.4), { tone: "hi" })));
    out.push(g("tf-stove-knob", L(k.segment([b.x, front + 2.6, 3.5], [b.x, front + 2.6, 5.4], P), { tone: "lit" })));
  }
  const mid = (BURNERS[0].x + BURNERS[1].x) / 2;
  out.push(g("tf-brass", S(k.slabOf({ x: mid - 1.6, y: front, w: 3.2, d: 1.4, r: 1.4 }, 2.4, 2.2, P, 4, 0.2), { tone: "mid" })));
  return out.join("");
}
// Blue flames ring the burner, in the gap the pan supports leave under the pot.
function flames(b) {
  const paths = [];
  // They lean out past the pot's foot, so the front ones show in the gap under the pot.
  for (let n = 0; n < 22; n++) {
    const a = (n / 22) * Math.PI * 2;
    const reach = b.foot + 1.6;
    const cx = b.x + Math.cos(a) * reach, cy = b.y + Math.sin(a) * reach;
    const base = at([cx, cy, STOVE_H + 1.2]), tip = at([cx, cy, STOVE_H + SUPPORT + 1]);
    const w = 1.5;
    paths.push(`<path class="tf-flame" d="M${(base[0] - w).toFixed(2)} ${base[1].toFixed(2)} Q${(base[0] - w * 0.6).toFixed(2)} ${((base[1] + tip[1]) / 2).toFixed(2)} ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} Q${(base[0] + w * 0.6).toFixed(2)} ${((base[1] + tip[1]) / 2).toFixed(2)} ${(base[0] + w).toFixed(2)} ${base[1].toFixed(2)} Z" style="animation-delay:-${((n * 0.37) % 1).toFixed(2)}s"/>`);
    const core = at([cx, cy, STOVE_H + 3.2]);
    paths.push(`<path class="tf-flame-core" d="M${(base[0] - w * 0.5).toFixed(2)} ${base[1].toFixed(2)} L${core[0].toFixed(2)} ${core[1].toFixed(2)} L${(base[0] + w * 0.5).toFixed(2)} ${base[1].toFixed(2)} Z"/>`);
  }
  return `<g class="tf-flames">${paths.join("")}</g>`;
}
// Pan supports (four steel prongs), the flames, then the pot drawn at the board's
// level and lifted onto the supports.
function onBurner(b, pot) {
  const top = STOVE_H + SUPPORT;
  const parts = [0.25, 1.25, 2.25, 3.25].map((q) => {
    const a = (q * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a), w = 0.8;
    const r0 = b.head + 2, r1 = b.r + 3;
    const arm = [[c * r0 - sn * w, sn * r0 + c * w], [c * r1 - sn * w, sn * r1 + c * w], [c * r1 + sn * w, sn * r1 - c * w], [c * r0 + sn * w, sn * r0 - c * w]].map(([x, y]) => [b.x + x, b.y + y]);
    return { x: b.x + c * r1, y: b.y + sn * r1, svg: g("tf-stove-iron", S(k.slabOf({ x: b.x + c * r1 - 1.2, y: b.y + sn * r1 - 1.2, w: 2.4, d: 2.4, r: 0.5 }, STOVE_H, SUPPORT - 1.2, P, 2, 0.1), { tone: "hi" }) + S(k.extrude(arm, top - 1.2, 1.2, P, { convex: true, bevel: 0.1 }), { tone: "hi" })) };
  });
  const lift = at([0, 0, top]), base = at([0, 0, 0]);
  return flames(b) + byDepth(parts).map((p) => p.svg).join("") + `<g transform="translate(${(lift[0] - base[0]).toFixed(2)} ${(lift[1] - base[1]).toFixed(2)})">${pot}</g>`;
}

function handi(x, y) {
  const out = [];
  out.push(g("tf-steel", S(cylAt(x, y, 13, 0, 3, 48), { tone: "mid" })));
  out.push(g("tf-steel", S(cylAt(x, y, 17, 3, 13, 64, 0.6), { tone: "hi", inner: L(k.sideArc(x, y, 17, 9, P, 40), { tone: "lo" }) })));
  out.push(g("tf-steel", S(cylAt(x, y, 14.5, 16, 3, 56), { tone: "hi" })));
  out.push(g("tf-steel", S(cylAt(x, y, 16, 19, 1.6, 56, 0.4), { tone: "hi" })));
  out.push(g("tf-dal", `<path class="iso-fill" d="${k.ring(x, y, 14.4, 20.6, P, 56)}"/>`));
  out.push(g("tf-seed", D(scatter(x, y, 11, 12, 20.6), { size: 0.6, tone: "hi" })));
  // Ladle: bowl sunk in the dal, handle resting on the rim and out past it.
  out.push(g("tf-steel", L(k.segment([x + 3, y + 2, 20.6], [x + 24, y + 14, 34], P), { tone: "hi" })));
  out.push(g("tf-steel", `<path class="iso-fill" d="${k.ring(x + 3, y + 2, 4, 20.7, P, 24)}"/>` + L(k.ring(x + 3, y + 2, 4, 20.7, P, 24), { tone: "hi" })));
  out.push(g("tf-steel", D([at([x + 24, y + 14, 34])], { size: 0.9, tone: "hi" })));
  out.push(steam(x, y, 21, 26, 4));
  return out.join("");
}

// The rice patila: a straight steel pot with a rolled rim, jeera rice inside.
function patila(x, y) {
  const out = [];
  out.push(g("tf-steel", S(cylAt(x, y, 13, 0, 18, 56, 0.6), { tone: "hi", inner: L(k.sideArc(x, y, 13, 6, P, 32), { tone: "lo" }) })));
  out.push(g("tf-steel", S(cylAt(x, y, 14, 18, 1.6, 56, 0.4), { tone: "hi" })));
  out.push(g("tf-rice", `<path class="iso-fill" d="${k.ring(x, y, 12.2, 19.6, P, 48)}"/>`));
  out.push(g("tf-cumin", D(scatter(x, y, 10, 30, 19.6), { size: 0.5, tone: "hi" })));
  out.push(steam(x, y, 20, 22, 3.4));
  return out.join("");
}

// A masala dabba, lid off: a round steel box of seven spice cups, the centre one
// and six around it, each heaped with its own colour.
const SPICES = ["tf-chilli", "tf-haldi", "tf-jeera", "tf-rai", "tf-dhania", "tf-garam", "tf-salt"];
function dabba(x, y) {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - 22, y: y - 22, w: 44, d: 44, r: 22 }, 0, 1, P)}" style="opacity:.5"/>`];
  out.push(g("tf-steel", S(cylAt(x, y, 19, 0, 1.6, 64), { tone: "mid" })));
  out.push(g("tf-steel", S(cylAt(x, y, 21, 1.6, 7, 96, 0.6), { tone: "hi", inner: L(k.sideArc(x, y, 21, 4.6, P, 48), { tone: "lo" }) })));
  const well = k.ring(x, y, 19.6, 8.6, P, 96);
  out.push(g("tf-dabba-in", `<path class="iso-fill" d="${well}"/>`));
  const cups = [{ x, y, spice: SPICES[0] }, ...Array.from({ length: 6 }, (_, n) => {
    const a = (n / 6) * Math.PI * 2 + 0.3;
    return { x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 12, spice: SPICES[n + 1] };
  })];
  for (const c of byDepth(cups)) {
    out.push(g("tf-steel", S(cylAt(c.x, c.y, 5.6, 3, 5.4, 40, 0.3), { tone: "hi" })));
    const heap = k.ring(c.x, c.y, 4.9, 8.4, P, 36);
    out.push(g(c.spice, `<path class="iso-fill" d="${heap}"/>`));
    out.push(g(c.spice, D(scatter(c.x, c.y, 3.6, 7, 8.6), { size: 0.6, tone: "hi" })));
    out.push(g("tf-steel", L(heap, { tone: "mid" })));
  }
  out.push(g("tf-steel", L(well, { tone: "mid" })));
  return out.join("");
}

// ── The tiffin ───────────────────────────────────────────────────────────
function tabRing(s, from, to, half, r, steps = 5, rIn = 0.4) {
  const [ux, uy] = [SIDE[0] * s, SIDE[1] * s], [vx, vy] = [-uy, ux];
  const pts = [];
  const corner = (cs, cv, a0, rr) => {
    for (let n = 0; n <= steps; n++) {
      const a = a0 + (n / steps) * (Math.PI / 2);
      const ls = cs + Math.cos(a) * rr, lv = cv + Math.sin(a) * rr;
      pts.push([ux * ls + vx * lv, uy * ls + vy * lv]);
    }
  };
  corner(to - r, half - r, 0, r);
  corner(from + rIn, half - rIn, Math.PI / 2, rIn);
  corner(from + rIn, -half + rIn, Math.PI, rIn);
  corner(to - r, -half + r, (3 * Math.PI) / 2, r);
  return pts;
}

// A latch tab riveted to the rim, with the hole the carrier's side bar drops through.
function tabs(z) {
  const out = [];
  for (const s of [1, -1]) {
    const [ux, uy] = [SIDE[0] * s, SIDE[1] * s];
    out.push(S(k.extrude(tabRing(s, R + 0.9, R + 11, 5.2, 3), z, LIP, P, { convex: true, bevel: 0.3 }), { tone: "hi" }));
    const hole = [ux * (R + 7.4), uy * (R + 7.4)];
    out.push(L(k.ring(hole[0], hole[1], 1.9, z + LIP, P, 20), { tone: "mid" }));
    out.push(D([at([ux * (R + 2.6) + uy * 2.6, uy * (R + 2.6) - ux * 2.6, z + LIP]), at([ux * (R + 2.6) - uy * 2.6, uy * (R + 2.6) + ux * 2.6, z + LIP])], { size: 0.5, tone: "hi" }));
  }
  return out.join("");
}

// Bottom to top, dishes from the real menu.
const FOODS = [
  { key: "rice", name: "Jeera Rice" },
  { key: "dal", name: "Tur Dal" },
  { key: "sabzi", name: "Palak Paneer" },
  { key: "roti", name: "Roti" },
];

function food(kind, level) {
  const out = [];
  if (kind === "rice") {
    out.push(g("tf-rice", S(cyl(MOUTH - 0.2, level - 4, 4, 96), { tone: "lo", crease: "none" })));
    out.push(g("tf-rice", D(scatter(0, 0, MOUTH - 3, 110, level), { size: 0.5, tone: "lo" })));
    out.push(g("tf-cumin", D(scatter(0, 0, MOUTH - 4, 34, level), { size: 0.55, tone: "hi" })));
  } else if (kind === "dal") {
    out.push(g("tf-dal", S(cyl(MOUTH - 0.2, level - 4, 4, 96), { tone: "lo", crease: "none" })));
    out.push(g("tf-dal", L(k.ring(0, 0, MOUTH - 9, level, P, 64) + k.ring(0, 0, MOUTH - 19, level, P, 48), { tone: "faint" })));
    out.push(g("tf-seed", D(scatter(0, 0, MOUTH - 6, 26, level), { size: 0.7, tone: "hi" })));
  } else if (kind === "sabzi") {
    out.push(g("tf-palak", S(cyl(MOUTH - 0.2, level - 4, 4, 96), { tone: "lo", crease: "none" })));
    out.push(g("tf-palak", D(scatter(0, 0, MOUTH - 4, 40, level), { size: 0.6, tone: "lo" })));
    out.push(g("tf-palak", L(k.ring(1.5, -1, MOUTH - 15, level, P, 64), { tone: "faint" })));
    const cubes = [];
    for (let n = 0; n < 9; n++) {
      const a = (n / 9) * Math.PI * 2 + 0.4, rr = n % 2 ? MOUTH - 12 : MOUTH - 22;
      cubes.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    for (const c of byDepth(cubes)) out.push(g("tf-paneer", S(k.slabOf({ x: c.x - 2.6, y: c.y - 2.6, w: 5.2, d: 5.2, r: 0.8 }, level - 1, 2.4, P, 2, 0.2), { tone: "lo" })));
  } else {
    for (let i = 0; i < 3; i++) out.push(g("tf-roti", S(cyl(MOUTH - 4.4 - i * 0.6, level - 3.6 + i * 1.3, 1.2, 96), { tone: "lo" })));
    out.push(g("tf-char", D(scatter(0, 0, MOUTH - 10, 22, level + 0.3), { size: 0.9, tone: "hi" })));
  }
  return out.join("");
}

function tier(i) {
  const z = BASE + i * PITCH;
  const body = z + FOOT;
  const top = body + BODY;
  const rim = top + LIP;
  const out = [];
  out.push(g("tf-leaf", S(cyl(R - 4, z, FOOT, 72), { tone: "mid" })));
  const beads = k.sideArc(0, 0, R, body + 7, P, 64) + k.sideArc(0, 0, R, top - 6, P, 64);
  out.push(g("tf-leaf", S(cyl(R, body, BODY, 96, 0.8), { tone: "hi", inner: L(beads, { tone: "lo" }) })));
  out.push(g("tf-leaf", S(cyl(R + 1.2, top, LIP, 96, 0.5), { tone: "hi" })));
  out.push(g("tf-leaf", tabs(top)));
  const mouth = k.ring(0, 0, MOUTH, rim, P, 96);
  out.push(`<clipPath id="tf-mouth-${i}"><path d="${mouth}"/></clipPath>`);
  out.push(g("tf-cavity", `<path class="iso-fill" d="${mouth}"/>`));
  out.push(`<g clip-path="url(#tf-mouth-${i})"><g data-food="${i}">${food(FOODS[i].key, rim - 6)}</g></g>`);
  out.push(g("tf-leaf", L(mouth, { tone: "mid" })));
  return `<g data-part="tier${i}">${out.join("")}</g>`;
}

function lid() {
  let z = LID_Z;
  const out = [];
  out.push(g("tf-lid", S(cyl(R - 4, z, FOOT, 72), { tone: "mid" })));
  z += FOOT;
  out.push(g("tf-lid", S(cyl(R + 1.2, z, LID.skirt, 96, 0.8), { tone: "hi", inner: L(k.sideArc(0, 0, R + 1.2, z + 3, P, 64), { tone: "lo" }) })));
  z += LID.skirt;
  out.push(g("tf-lid", S(cyl(R - 3, z, LID.shoulder, 96, 0.5), { tone: "hi" })));
  z += LID.shoulder;
  out.push(g("tf-lid", S(cyl(R - 10, z, LID.dome, 80, 0.6), { tone: "hi" })));
  z += LID.dome;
  out.push(g("tf-lid", S(cyl(R - 17, z, LID.cap, 64, 0.4), { tone: "hi" })));
  z += LID.cap;
  const rivets = [0, 1, 2, 3, 4, 5].map((n) => at([Math.cos((n / 6) * Math.PI * 2) * (R - 20), Math.sin((n / 6) * Math.PI * 2) * (R - 20), z]));
  out.push(g("tf-lid", D(rivets, { size: 0.5, tone: "mid" })));
  out.push(g("tf-knob", S(cyl(4.2, z, LID.stem, 32), { tone: "mid" })));
  z += LID.stem;
  out.push(g("tf-knob", S(cyl(8.5, z, LID.knob, 48, 0.6), { tone: "hi", inner: L(k.knurl(0, 0, 8.5, z, z + LID.knob, 40, P), { tone: "lo" }) })));
  z += LID.knob;
  out.push(g("tf-knob", L(k.ring(0, 0, 4.4, z, P, 32), { tone: "lo" })));
  out.push(`<g data-part="steam">${steam(0, 0, z, 30, 5)}</g>`);
  return `<g data-part="lid">${out.join("")}</g>`;
}

// ── In front: two katoris of sides and the mark's spoon ──────────────────
function katori(x, y, kind) {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - 11, y: y - 11, w: 22, d: 22, r: 11 }, 0, 1, P)}" style="opacity:.5"/>`];
  out.push(g("tf-steel", S(cylAt(x, y, 8, 0, 2, 48), { tone: "mid" })));
  out.push(g("tf-steel", S(cylAt(x, y, 11, 2, 7, 64, 0.5), { tone: "hi", inner: L(k.sideArc(x, y, 11, 5, P, 32), { tone: "lo" }) })));
  const rim = k.ring(x, y, 9.8, 9, P, 56);
  out.push(g(kind === "raita" ? "tf-raita" : "tf-salad", `<path class="iso-fill" d="${rim}"/>`));
  if (kind === "raita") {
    out.push(g("tf-boondi", D(scatter(x, y, 7.6, 16, 9), { size: 0.8, tone: "hi" })));
    out.push(g("tf-mint", D(scatter(x, y, 7.6, 8, 9), { size: 0.5, tone: "hi" })));
  } else {
    out.push(g("tf-tomato", D(scatter(x, y, 7.6, 12, 9), { size: 0.9, tone: "hi" })));
    out.push(g("tf-cucumber", D(scatter(x, y, 7.6, 12, 9), { size: 0.9, tone: "hi" })));
    out.push(g("tf-onion", D(scatter(x, y, 7.6, 8, 9), { size: 0.8, tone: "hi" })));
  }
  out.push(g("tf-steel", L(rim, { tone: "mid" })));
  return `<g data-part="side-${kind}">${out.join("")}</g>`;
}

// The orange spoon from the mark: a flat oval bowl on a tapering handle, lying on the mat.
function spoon(x, y) {
  const ux = Math.cos(-0.5), uy = Math.sin(-0.5);
  const vx = -uy, vy = ux;
  const oval = [];
  const N = 28;
  for (let n = 0; n < N; n++) {
    const a = (n / N) * Math.PI * 2;
    oval.push([10 * Math.cos(a), 6.8 * Math.sin(a)]);
  }
  const place = ([s, v]) => [x + ux * s + vx * v, y + uy * s + vy * v];
  const bowl = oval.map(place);
  const handle = [[-8, -1.6], [-36, -2.4], [-38.4, 0], [-36, 2.4], [-8, 1.6]].map(place);
  const out = [];
  out.push(g("tf-knob", S(k.extrude(handle, 0, 1.4, P, { convex: true, bevel: 0.2 }), { tone: "hi" })));
  out.push(g("tf-knob", S(k.extrude(bowl, 0, 1.8, P, { convex: true, bevel: 0.3 }), { tone: "hi" })));
  out.push(g("tf-knob", L(k.onTop(oval.map(([s, v]) => place([s * 0.72, v * 0.66])), 1.8, P, true), { tone: "lo" })));
  return `<g data-part="spoon">${out.join("")}</g>`;
}

// The thali the stack stands on: a steel plate with a raised rim and turned rings.
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: -PLATE_R, y: -PLATE_R, w: 2 * PLATE_R, d: 2 * PLATE_R, r: PLATE_R }, 0, 1.2, P)}" style="opacity:.5"/>`];
  out.push(g("tf-steel", S(cyl(PLATE_R - 6, 0, 1.2, 96), { tone: "mid" })));
  out.push(g("tf-steel", S(cyl(PLATE_R, 1.2, PLATE_H - 1.2, 120, 0.5), { tone: "hi" })));
  const well = k.ring(0, 0, PLATE_R - 5, PLATE_H, P, 120);
  out.push(g("tf-plate-well", `<path class="iso-fill" d="${well}"/>`));
  out.push(g("tf-steel", L(well + k.ring(0, 0, PLATE_R - 2.5, PLATE_H, P, 120), { tone: "mid" })));
  out.push(g("tf-steel", L([PLATE_R - 16, PLATE_R - 30].map((r) => k.ring(0, 0, r, PLATE_H, P, 96)).join(""), { tone: "lo" })));
  return `<g data-part="plate">${out.join("")}</g>`;
}

// A jar of achar on the front corner of the prep board: red pickle under a steel screw cap.
function acharJar(x, y) {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - 12, y: y - 12, w: 24, d: 24, r: 12 }, 0, 1, P)}" style="opacity:.5"/>`];
  out.push(g("tf-achar", S(cylAt(x, y, 9, 0, 20, 56, 0.8), { tone: "hi", inner: L(k.sideArc(x, y, 9, 6, P, 32) + k.sideArc(x, y, 9, 14, P, 32), { tone: "lo" }) })));
  out.push(g("tf-steel", S(cylAt(x, y, 7.4, 20, 1.6, 40), { tone: "mid" })));
  out.push(g("tf-steel", S(cylAt(x, y, 9.4, 21.6, 4, 56, 0.4), { tone: "hi", inner: L(k.knurl(x, y, 9.4, 22, 25, 36, P), { tone: "lo" }) })));
  return `<g data-part="achar">${out.join("")}</g>`;
}

// A steel tumbler of water at the front.
function tumbler(x, y) {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - 10, y: y - 10, w: 20, d: 20, r: 10 }, 0, 1, P)}" style="opacity:.5"/>`];
  out.push(g("tf-steel", S(cylAt(x, y, 7, 0, 22, 56, 0.6), { tone: "hi", inner: L(k.sideArc(x, y, 7, 4, P, 32) + k.sideArc(x, y, 7, 18, P, 32), { tone: "lo" }) })));
  const top = k.ring(x, y, 6.2, 22, P, 48);
  out.push(g("tf-water", `<path class="iso-fill" d="${top}"/>`));
  out.push(g("tf-steel", L(top, { tone: "mid" })));
  return `<g data-part="tumbler">${out.join("")}</g>`;
}

// A desk calendar standing on the back of the mat, behind the tiffin: seven day
// columns over four weeks under a saffron header with two binder rings. Each column
// is its own group, so the page can light the days a plan delivers on; each cell's
// week row (data-week) lets the page fill the weeks of a plan one row at a time.
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const CAL = { x0: 40, x1: 116, y: -64, t: 3.2, h: 72 };
const CAL_FACE = CAL.y + CAL.t / 2;
const CAL_COL = (CAL.x1 - CAL.x0 - 8) / 7;
const CAL_ROWS = 4;
const CAL_ROW = 10.6;
const cellBox = (x0, x1, z, h, depth = 1.1) => k.slabOf({ x: x0, y: CAL_FACE, w: x1 - x0, d: depth, r: 0.4 }, z, h, P, 2, 0.15);
function calendar() {
  const foot = { x: CAL.x0 - 3, y: CAL.y - 6, w: CAL.x1 - CAL.x0 + 6, d: 12, r: 2 };
  const panel = { x: CAL.x0, y: CAL.y - CAL.t / 2, w: CAL.x1 - CAL.x0, d: CAL.t, r: 0.6 };
  const out = [`<path class="iso-halo" d="${k.haloOf(foot, 0, 1, P)}" style="opacity:.5"/>`];
  out.push(g("tf-wood", S(k.slabOf(foot, 0, 3, P, 4, 0.4), { tone: "mid" })));
  out.push(g("tf-paper", S(k.slabOf(panel, 3, CAL.h, P, 3, 0.3), { tone: "mid" })));
  const top = 3 + CAL.h;
  out.push(g("tf-cal-head", S(cellBox(CAL.x0 + 2, CAL.x1 - 2, top - 13, 9, 1.3), { tone: "hi" })));
  for (const rx of [CAL.x0 + 16, CAL.x1 - 16]) out.push(g("tf-steel", S(cylAt(rx, CAL.y, 1.5, top - 3, 7, 20, 0.2), { tone: "hi" })));
  const cols = DAYS.map((day, i) => {
    const x0 = CAL.x0 + 4 + i * CAL_COL + (i >= 5 ? 0.6 : 0), x1 = x0 + CAL_COL - 1.4;
    const cells = Array.from({ length: CAL_ROWS }, (_, r) => {
      const z = top - 18 - (r + 1) * CAL_ROW;
      return `<g data-week="${r}">${g("tf-tile", S(cellBox(x0, x1, z, CAL_ROW - 2.2), { tone: "hi" }))}</g>`;
    });
    return `<g data-day="${day}">${cells.join("")}</g>`;
  });
  return `<g data-part="calendar">${out.join("")}<g data-cal-page="">${cols.join("")}</g></g>`;
}

const sides = byDepth([
  { x: 82, y: 22, svg: () => katori(82, 22, "raita") },
  { x: 64, y: 66, svg: () => katori(64, 66, "salad") },
  { x: -30, y: 76, svg: () => spoon(-30, 76) },
  { x: -60, y: 50, svg: () => tumbler(-60, 50) },
]).map((s) => s.svg()).join("");

const tiersSvg = Array.from({ length: TIERS }, (_, i) => tier(i)).join("");
const ART = [board(), mat(), plate(), acharJar(-118, 40), calendar(), tiersSvg, lid(), sides].join("");

const origin = at([0, 0, 0]);
const up = at([0, 0, 1]);
const EZ = [up[0] - origin[0], up[1] - origin[1]];
const fwd = at([0, 1, 0]);
const pt = (p) => p.map((v) => +v.toFixed(2));
// The calendar page's top edge on screen, the line it folds up over when a month turns.
const CAL_TOP_Z = 3 + CAL.h - 15;
const CAL_HINGE = [...pt(at([CAL.x0, CAL_FACE, CAL_TOP_Z])), ...pt(at([CAL.x1, CAL_FACE, CAL_TOP_Z]))];

const EY = [fwd[0] - origin[0], fwd[1] - origin[1]];
const LABEL =
  "The Tiffin Grab mark built as a four-tier steel tiffin on a bamboo mat: jeera rice, tur dal, palak paneer and rotis in green tiers under a marigold lid with an orange knob. Behind it, a prep board with dal and rice cooking on a two-burner gas stove and a masala dabba of seven spices; The tiffin stands on a steel thali, a jar of achar on the board, a steel tumbler of water, katoris of boondi raita and kachumber salad and the mark's orange spoon in front; at the back, a desk calendar whose day columns light for the delivery days. At the end the tiffin is latched, steaming, ready for delivery.";

const ts = `// Generated by scripts/tiffin-figure/build.mjs. Do not edit by hand.
export const TIFFIN_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";
export const TIFFIN_LABEL = ${JSON.stringify(LABEL)};
/** Screen offset of one world unit straight up. */
export const TIFFIN_EZ: readonly [number, number] = [${EZ.map((v) => +v.toFixed(5)).join(", ")}];
/** Screen offset of one world unit toward the viewer's left, out of the calendar face. */
export const TIFFIN_EY: readonly [number, number] = [${EY.map((v) => +v.toFixed(5)).join(", ")}];
export const TIFFIN_TIERS = ${TIERS};
/** The calendar page's fold line on screen, [x0, y0, x1, y1]. */
export const TIFFIN_CAL_HINGE = ${JSON.stringify(CAL_HINGE)} as const;

export const TIFFIN_SPREAD = ${SPREAD};
export const TIFFIN_LID_GAP = ${LID_GAP};
export const TIFFIN_FOODS = ${JSON.stringify(FOODS.map((f) => f.name))} as const;
export const TIFFIN_SRC = "/landing/tiffin-figure.svg";
export const TIFFIN_STATIC_SRC = "/landing/tiffin-figure-static.svg";
`;
writeFileSync(OUT, ts);
mkdirSync(dirname(SVG_OUT), { recursive: true });
const file = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: [ART] });
writeFileSync(SVG_OUT, file);
// The same drawing with its styles inside, for an <img> that cannot see the page's CSS:
// the page shows it until the live copy is swapped in, and without JavaScript.
const css = ["iso.css", "tiffin-figure.css"].map((f) => readFileSync(join(HERE, "../../components/landing", f), "utf8")).join("\n");
const scoped = file.replace(/^<svg ([^>]*)class="iso-svg"/, '<svg $1class="iso-svg tf-figure"').replace(/>/, `><style>${css.replace(/var\(--primary[^)]*\)/g, "#f06b1a").replace(/var\(--card[^)]*\)/g, "#ffffff")}</style>`);
writeFileSync(STATIC_OUT, scoped);
console.log("wrote", OUT, "and", SVG_OUT, `${(file.length / 1024).toFixed(1)} KB`);

const previewAt = process.argv.indexOf("--preview");
if (previewAt > 0) {
  const theme = process.argv.includes("--light") ? "light" : "dark";
  const state = process.argv.includes("--state") ? process.argv[process.argv.indexOf("--state") + 1] : "packed";
  const css = readFileSync(join(HERE, "../../components/landing/tiffin-figure.css"), "utf8");
  // Open: tiers spread, lid held high. A preview-only pose; the page animates these.
  const lift = (n) => `transform:translate(${EZ[0] * n}px,${EZ[1] * n}px)`;
  const pose = state === "open"
    ? Array.from({ length: TIERS }, (_, i) => `[data-part="tier${i}"]{${lift(i * SPREAD)}}`).join("") + `[data-part="lid"]{${lift((TIERS - 1) * SPREAD + LID_GAP)}}`
    : "";
  const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: [ART] });
  const body = k.plateHtml({ fig: "Fig 1", title: "Tiffin, packed", hint: "Scroll to pack", readout: state, keys: [], caption: LABEL, body: `<div class="iso-stage tf-figure">${svg}</div>` });
  writeFileSync(process.argv[previewAt + 1], k.pageHtml({ title: "Tiffin", theme, body, script: "", width: 900 }).replace("</style>", `${css}${pose}</style>`));
  console.log("preview", process.argv[previewAt + 1]);
}
