// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChartContainer, ChartTooltipContent } from "./chart";
import { valueFormatter } from "@/components/dashboard/analytics/charts-impl";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
}));

beforeAll(() => {
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
});

afterEach(cleanup);

describe("ChartTooltipContent", () => {
  it("renders on the dark tooltip surface with no border or shadow", () => {
    render(
      <ChartContainer config={{ fees: { label: "Fees", color: "red" } }}>
        <ChartTooltipContent
          active
          payload={[{ name: "fees", dataKey: "fees", value: 4, color: "red", graphicalItemId: "fees", payload: {} }]}
        />
      </ChartContainer>,
    );
    const root = screen.getAllByText("Fees")[0].closest(".min-w-32");
    const tokens = root?.getAttribute("class")?.split(/\s+/) ?? [];
    for (const token of ["bg-foreground", "text-background", "rounded-(--ui-tooltip-radius)", "p-(--ui-tooltip-padding)"]) {
      expect(tokens).toContain(token);
    }
    for (const token of ["bg-popover", "border", "shadow-xl", "text-popover-foreground"]) {
      expect(tokens).not.toContain(token);
    }
  });

  it("gives the value and name formatters light text on the dark surface", () => {
    const { container } = render(
      <ChartContainer config={{ fees: { label: "Fees", color: "red" } }}>
        <ChartTooltipContent
          active
          payload={[{ name: "Fees", dataKey: "fees", value: 4, color: "red", graphicalItemId: "fees", payload: {} }]}
          formatter={valueFormatter("currency", "CAD")}
        />
      </ChartContainer>,
    );
    const surface = container.querySelector(".bg-foreground");
    expect(surface).not.toBeNull();
    for (const el of [surface!, ...Array.from(surface!.querySelectorAll("*"))]) {
      expect(el.className).not.toMatch(/(^|\s)text-foreground(\s|$)/);
      expect(el.className).not.toMatch(/(^|\s)text-muted-foreground(\s|$)/);
    }
  });
});
