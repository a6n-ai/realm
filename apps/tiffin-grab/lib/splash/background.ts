// The splash background: a Paper Shaders mesh gradient as the base with the warp "silk" laid over it
// at part opacity (@paper-design/shaders, MIT). Loaded lazily, only when a splash shows, so it never
// weighs on a normal page. If WebGL is missing the CSS aurora under it stays as the background.
// Palettes: Dusk (lavender, peach, rose on cream) in light; Sky (navy and blue, an amber glow) in dark.

const PALETTE = {
  light: { mesh: ["#fbf3ee", "#d9c8f2", "#ffc9a8", "#f6b8c8", "#e9ddf8"], silk: ["#fdf6f2", "#d6c4f0", "#ffd5b8", "#f3c0d0"] },
  dark: { mesh: ["#0c1426", "#16294f", "#1f3d6b", "#5a3a1a", "#0f1d38"], silk: ["#0b1324", "#1d3a66", "#13264a", "#6b4520"] },
};

type Mount = { dispose: () => void };

/** Mounts the two shader layers into `base` and `silk`; returns a dispose function. */
export async function mountSplashBackground(base: HTMLElement, silk: HTMLElement, dark: boolean, still: boolean): Promise<() => void> {
  const P = await import("@paper-design/shaders");
  const noise = P.getShaderNoiseTexture();
  if (noise && !(noise.complete && noise.naturalWidth)) await new Promise<void>((r) => { noise.addEventListener("load", () => r(), { once: true }); noise.addEventListener("error", () => r(), { once: true }); });
  const pal = PALETTE[dark ? "dark" : "light"];
  const sizing = { u_fit: P.ShaderFitOptions.none, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };
  // soft gradients need no retina pixels: cap each layer's buffer so the orb keeps its frames
  const MAX_PX = 900_000;
  const mounts: Mount[] = [
    new P.ShaderMount(base, P.meshGradientFragmentShader, { ...sizing, u_colors: pal.mesh.map(P.getShaderColorFromString), u_colorsCount: pal.mesh.length, u_distortion: 0.8, u_swirl: 0.12, u_grainMixer: 0, u_grainOverlay: 0.04 }, undefined, still ? 0 : 0.22, 0, 1, MAX_PX),
    new P.ShaderMount(silk, P.warpFragmentShader, { ...sizing, u_colors: pal.silk.map(P.getShaderColorFromString), u_colorsCount: pal.silk.length, u_proportion: 0.42, u_softness: 1, u_distortion: 0.2, u_swirl: 0.7, u_swirlIterations: 10, u_shapeScale: 0.12, u_shape: P.WarpPatterns.edge, u_noiseTexture: noise }, undefined, still ? 0 : 0.26, 0, 1, MAX_PX),
  ];
  return () => mounts.forEach((m) => m.dispose());
}
