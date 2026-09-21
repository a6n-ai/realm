// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, Choice, ChoiceGroup, DatePicker, Divider, IconButton, Input, Label, OptionCard, Pill, PillToggle } from "..";

afterEach(cleanup);

describe("OptionCard / PillToggle", () => {
  it("OptionCard is aria-pressed, or aria-checked when it is a radio", () => {
    render(<><OptionCard selected>A</OptionCard><OptionCard selected={false} role="radio">B</OptionCard></>);
    expect(screen.getByText("A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "B" })).not.toHaveAttribute("aria-pressed");
  });
  it("PillToggle is a 48px aria-pressed pill and honours disabled", () => {
    const onClick = vi.fn();
    render(<PillToggle on disabled onClick={onClick}>Mon</PillToggle>);
    const b = screen.getByRole("button", { name: "Mon" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(b).toBeDisabled();
    expect(b.className).toMatch(/h-12.*rounded-full/);
  });
});

describe("ChoiceGroup", () => {
  function Harness({ onPick }: { onPick: (v: string) => void }) {
    const [v, setV] = useState("4");
    return (
      <ChoiceGroup label="Duration" value={v} onChange={(n) => (setV(n), onPick(n))}>
        {["1", "2", "4"].map((w) => (
          <Choice key={w} value={w}>{w}wk</Choice>
        ))}
      </ChoiceGroup>
    );
  }
  it("is a radiogroup with roving tabindex; arrows move and select", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    expect(screen.getByRole("radiogroup", { name: "Duration" })).toBeInTheDocument();
    const [one, two, four] = screen.getAllByRole("radio");
    expect(four).toHaveAttribute("aria-checked", "true");
    expect([one, two, four].map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    four.focus();
    fireEvent.keyDown(four, { key: "ArrowDown" });
    expect(one).toHaveFocus();
    expect(onPick).toHaveBeenLastCalledWith("1");
    expect(one).toHaveAttribute("aria-checked", "true");
  });
  it("Choice outside a group is a programmer error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Choice value="x">x</Choice>)).toThrow();
    err.mockRestore();
  });
});

describe("form bits", () => {
  it("Label associates and Input dense is the 44px checkout size", () => {
    render(<><Label htmlFor="n">Name</Label><Input id="n" dense /><Input id="m" invalid /></>);
    expect(screen.getByLabelText("Name").className).toMatch(/min-h-11.*rounded-xl/);
    expect(document.getElementById("m")).toHaveAttribute("aria-invalid", "true");
  });
  it("Pill sm + save tone, IconButton link + button, Divider, Button ghost/pill", () => {
    render(
      <>
        <Pill size="sm" tone="save">Save 10%</Pill>
        <IconButton href="/x" aria-label="Close">x</IconButton>
        <IconButton aria-label="Prev" disabled>p</IconButton>
        <Divider />
        <Button variant="ghost" pill>Go</Button>
      </>,
    );
    expect(screen.getByText("Save 10%").className).toMatch(/py-0\.5.*color-mix/);
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/x");
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" }).className).toMatch(/rounded-full.*border-transparent/);
  });
});

describe("DatePicker", () => {
  const props = { id: "d", label: "Start date", format: (i: string) => `on ${i}`, min: "2026-09-22" } as const;
  it("shows the value, opens a sheet month grid, picks a day and closes", () => {
    const onChange = vi.fn();
    render(<DatePicker {...props} value="2026-09-23" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /start date/i });
    expect(trigger).toHaveTextContent("on 2026-09-23");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Thursday, September 24/ }));
    expect(onChange).toHaveBeenCalledWith("2026-09-24");
  });
  it("blocks days before min and by rule, saying why; month arrows respect bounds", () => {
    const onChange = vi.fn();
    render(<DatePicker {...props} value="" onChange={onChange} disabledReason={(i) => (i === "2026-09-26" ? "Not a delivery day" : undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 21.*unavailable/ }));
    fireEvent.click(screen.getByRole("button", { name: /Saturday, September 26.*unavailable/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Not a delivery day");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });
});
