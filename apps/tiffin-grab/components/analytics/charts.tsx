"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import { ChartSkeleton } from "./skeletons";

// recharts is about 100 KB; split it out so analytics pages paint before their charts.
const load = () => import("./recharts");
const Trend = lazy(() => load().then((m) => ({ default: m.TrendLineChart })));
const Breakdown = lazy(() => load().then((m) => ({ default: m.BreakdownBarChart })));
const Distribution = lazy(() => load().then((m) => ({ default: m.DistributionDonutChart })));

export function TrendLineChart(props: ComponentProps<typeof Trend>) {
  return (
    <Suspense fallback={<ChartSkeleton height={props.height} />}>
      <Trend {...props} />
    </Suspense>
  );
}

export function BreakdownBarChart(props: ComponentProps<typeof Breakdown>) {
  return (
    <Suspense fallback={<ChartSkeleton height={props.height} />}>
      <Breakdown {...props} />
    </Suspense>
  );
}

export function DistributionDonutChart(props: ComponentProps<typeof Distribution>) {
  return (
    <Suspense fallback={<ChartSkeleton height={props.height} />}>
      <Distribution {...props} />
    </Suspense>
  );
}
