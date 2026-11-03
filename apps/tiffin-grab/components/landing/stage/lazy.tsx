"use client";

import dynamic from "next/dynamic";

// The phone demos are below the fold and pull ~80KB of stage-kit CSS. Loading them client-side
// keeps that CSS off the first paint; the placeholder holds the stage's own box (340 x 715) so
// nothing moves when the demo arrives.
const Placeholder = () => <div aria-hidden style={{ width: "100%", maxWidth: 340, aspectRatio: "340 / 715", margin: "0 auto" }} />;

export const LazyPauseDemo = dynamic(() => import("./pause-demo").then((m) => m.PauseDemo), { ssr: false, loading: Placeholder });
export const LazyMenuPickDemo = dynamic(() => import("./menu-pick-demo").then((m) => m.MenuPickDemo), { ssr: false, loading: Placeholder });
