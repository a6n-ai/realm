# S3 C1 report

Plan: dataviz form per audit (part-to-whole -> SegmentedBar, ordered -> Funnel, grid of magnitudes -> Heatmap, signed -> Diverging, 2 series -> line); ReUI: semantic/status tokens, chart-N tokens, gap-*, text-sm/xs, hover transition-colors/opacity only, ChartEmpty + lazy skeleton.

Pure logic in components/analytics/chart-math.ts (foldParts, funnelStages, heatBucket/heatOpacity, topWithOther, rankedHeight, positionalConfig). Components in charts-impl.tsx, lazy-exported in charts.tsx.

APIs:
- SegmentedBar({parts:{label,value,tone?}[], format?, withList?}) tone: success|warning|destructive|muted|chart
- FunnelChart({stages:{label,value}[], format?})
- HeatmapGrid({rows, columns, cells:(number|null)[][], format?})
- DivergingBarChart({data, xKey, yKey, label?, format?, height?})
- TrendLineChart gains mode="line" (positional keys, 2px lines, legend + end labels, domain floor 0 unless negatives)
- BreakdownBarChart horizontal: height rows*36 (min 3), maxBarSize 32, limit=8 + Other

Tests: __tests__/chart-math.test.ts (fold/100% shares, funnel kept, heat buckets, top8+Other sum, height, positional keys with </style>).
Verify: tsc --noEmit clean; env -u DATABASE_URL vitest run components lib/analytics -> 109 files / 668 tests pass.

## Fix round 1
- Tooltips: SegmentedBar/FunnelChart/HeatmapGrid use components/ui/tooltip; segments, stage bars and cells are tabIndex=0 with aria-label; SegmentedBar role="img" dropped.
- Lazy skeleton for horizontal BreakdownBarChart = rankedHeight(min(data.length, limit+1)).
- foldParts folds at 5 (4 + Other); mixed status charts skip red --chart-4.
- Heatmap: real 0 shows "0", null "—"; dense cells (bucket>=4) use text-background.
- Diverging rows carry sign fill so the tooltip swatch matches.
- topWithOther always sorts desc and never folds a lone leftover row.
- Line mode skips end labels when end values are within 8% of range.
- Tests: fold-at-5, chart-4 skip, single leftover, heatIsDense. tsc clean; vitest components lib/analytics: 109 files, 670 tests pass.
- Note: prettier was run on charts-impl.tsx/charts.tsx, so the diff reformats those files.
