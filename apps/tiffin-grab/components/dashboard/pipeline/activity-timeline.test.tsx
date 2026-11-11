// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { ScrollTextIcon } from "lucide-react";
import { ActivityTimeline, type ActivityFilter, type ActivityItem } from "./activity-timeline";

afterEach(cleanup);

const NOW = Date.now();
const item = (id: string, over: Partial<ActivityItem>): ActivityItem => ({
  id, type: "note", icon: ScrollTextIcon, tone: "", title: `title ${id}`, note: null, outcome: null,
  nextFollowUpAt: null, createdAt: NOW, actor: { label: "Asha", kind: "staff" }, ...over,
});
const FILTERS: ActivityFilter[] = [
  { key: "all", label: "All", types: null },
  { key: "calls", label: "Calls", types: ["call"] },
];
const items = [
  item("n1", { title: "Note one" }),
  item("c1", { type: "call", title: "Call one" }),
  item("s1", { type: "stage_change", title: "Status moved", system: true, actor: { label: "System", kind: "system" } }),
  item("s2", { type: "created", title: "Inquiry created", system: true, actor: { label: "System", kind: "system" }, createdAt: NOW - 1000 }),
];

describe("ActivityTimeline grouped", () => {
  it("collapses system events under All and shows a day header", () => {
    render(<TimezoneProvider tz="UTC"><ActivityTimeline items={items} filters={FILTERS} onAddNote={() => undefined} grouped now={NOW} /></TimezoneProvider>);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Note one")).toBeInTheDocument();
    expect(screen.queryByText("Status moved")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2 system events" }));
    expect(screen.getByText("Status moved")).toBeInTheDocument();
  });

  it("filters to calls and does not collapse system events", () => {
    render(<TimezoneProvider tz="UTC"><ActivityTimeline items={items} filters={FILTERS} onAddNote={() => undefined} grouped now={NOW} /></TimezoneProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Calls" }));
    expect(screen.getByText("Call one")).toBeInTheDocument();
    expect(screen.queryByText("Note one")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /system events?/ })).not.toBeInTheDocument();
  });
});
