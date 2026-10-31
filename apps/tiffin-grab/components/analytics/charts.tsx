"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import { ChartSkeleton } from "./skeletons";
import { calendarHeight } from "@/lib/analytics/calendar-height";
import { rankedHeight } from "./chart-math";

// recharts is about 100 KB; split it out so analytics pages paint before their charts.
const load = () => import("./charts-impl");
const Trend = lazy(() => load().then((m) => ({ default: m.TrendLineChart })));
const Breakdown = lazy(() =>
  load().then((m) => ({ default: m.BreakdownBarChart })),
);

const Segmented = lazy(() => load().then((m) => ({ default: m.SegmentedBar })));
const Parts = lazy(() => load().then((m) => ({ default: m.PartsDonut })));
const Treemap = lazy(() => load().then((m) => ({ default: m.TreemapChart })));
const Heatmap = lazy(() => load().then((m) => ({ default: m.HeatmapGrid })));
const Calendar = lazy(() =>
  load().then((m) => ({ default: m.CalendarHeatmap })),
);
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
export const SegmentedBar = wrap(Segmented);
export const PartsDonut = wrap(Parts);
export const TreemapChart = wrap(Treemap);
export const HeatmapGrid = wrap(Heatmap);
export const DivergingBarChart = wrap(Diverging);

export function CalendarHeatmap(props: ComponentProps<typeof Calendar>) {
  const height = calendarHeight(props.from, props.today && props.today < props.to ? props.today : props.to);
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <Calendar {...props} />
    </Suspense>
  );
}
