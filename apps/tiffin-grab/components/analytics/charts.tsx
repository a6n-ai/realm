"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import { ChartSkeleton } from "./skeletons";
import { rankedHeight } from "./chart-math";

// recharts is about 100 KB; split it out so analytics pages paint before their charts.
const load = () => import("./charts-impl");
const Trend = lazy(() => load().then((m) => ({ default: m.TrendLineChart })));
const Breakdown = lazy(() =>
  load().then((m) => ({ default: m.BreakdownBarChart })),
);
const Distribution = lazy(() =>
  load().then((m) => ({ default: m.DistributionDonutChart })),
);
const HoverValue = lazy(() =>
  load().then((m) => ({ default: m.HoverValueBarChart })),
);
const Grouped = lazy(() =>
  load().then((m) => ({ default: m.GroupedBarChart })),
);
const RadialRate = lazy(() =>
  load().then((m) => ({ default: m.RadialRateChart })),
);
const ActiveDonut = lazy(() =>
  load().then((m) => ({ default: m.ActiveSegmentDonutChart })),
);

const Segmented = lazy(() => load().then((m) => ({ default: m.SegmentedBar })));
const Funnel = lazy(() => load().then((m) => ({ default: m.FunnelChart })));
const Heatmap = lazy(() => load().then((m) => ({ default: m.HeatmapGrid })));
const Diverging = lazy(() =>
  load().then((m) => ({ default: m.DivergingBarChart })),
);

type SkeletonProps = {
  height?: number;
  orientation?: string;
  data?: unknown[];
  limit?: number;
};

// Horizontal ranked bars size by row count, so the skeleton must too or the page shifts on load.
function skeletonHeight({
  height,
  orientation,
  data,
  limit = 8,
}: SkeletonProps) {
  if (orientation === "vertical" || !data) return height;
  return rankedHeight(Math.min(data.length, limit + 1));
}

function wrap<C extends React.ComponentType<any>>(Inner: C, sized = false) {
  return function Chart(props: ComponentProps<C>) {
    return (
      <Suspense
        fallback={
          <ChartSkeleton
            height={
              sized
                ? skeletonHeight(props as SkeletonProps)
                : (props as { height?: number }).height
            }
          />
        }
      >
        <Inner {...props} />
      </Suspense>
    );
  };
}

export const TrendLineChart = wrap(Trend);
export const BreakdownBarChart = wrap(Breakdown, true);
export const DistributionDonutChart = wrap(Distribution);
export const HoverValueBarChart = wrap(HoverValue);
export const GroupedBarChart = wrap(Grouped);
export const RadialRateChart = wrap(RadialRate);
export const ActiveSegmentDonutChart = wrap(ActiveDonut);
export const SegmentedBar = wrap(Segmented);
export const FunnelChart = wrap(Funnel);
export const HeatmapGrid = wrap(Heatmap);
export const DivergingBarChart = wrap(Diverging);
