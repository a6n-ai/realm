// Shared motion presets so `motion` components and the CSS vars in globals.css
// stay in visual agreement. Durations are in SECONDS (motion's unit); the CSS
// vars mirror them in ms. Change here + globals.css together.
export const transitions = {
  springSoft: { type: "spring", stiffness: 380, damping: 32, mass: 0.9 },
  easeBase: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  easeSlow: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  stagger: 0.06,
} as const;
