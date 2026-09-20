// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionRow, Button, Field, Notice, Stepper, Toggle } from "..";

afterEach(cleanup);

describe("Button", () => {
  it("with a reason is aria-disabled, never fires, and shows the reason on tap", () => {
    const onClick = vi.fn();
    render(<Button disabledReason="Cutoff passed" onClick={onClick}>Hold</Button>);
    const b = screen.getByRole("button", { name: "Hold" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    expect(screen.queryByText("Cutoff passed", { selector: "p" })).toBeNull();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Cutoff passed");
  });
  it("pending blocks clicks and sets aria-busy", () => {
    const onClick = vi.fn();
    render(<Button pending onClick={onClick}>Save</Button>);
    const b = screen.getByRole("button", { name: /Save/ });
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });
  it("enabled fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Stepper", () => {
  it("clamps to min and max", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper label="Items" value={1} min={1} max={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Items" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Increase Items" }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    rerender(<Stepper label="Items" value={2} min={1} max={2} onChange={onChange} />);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Increase Items" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Increase Items" })).toHaveAttribute("aria-disabled", "true");
  });
  it("announces the value politely", () => {
    render(<Stepper label="Items" value={3} onChange={() => {}} />);
    expect(screen.getByText("3")).toHaveAttribute("aria-live", "polite");
  });
});

describe("Toggle", () => {
  it("is a switch that flips", () => {
    const onChange = vi.fn();
    render(<Toggle label="Notify" checked={false} onChange={onChange} />);
    const s = screen.getByRole("switch", { name: "Notify" });
    expect(s).toHaveAttribute("aria-checked", "false");
    fireEvent.click(s);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Field", () => {
  it("links label, hint and error", () => {
    render(<Field label="Email" hint="We never share" error="Invalid" />);
    const i = screen.getByLabelText("Email");
    expect(i).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid");
    const ids = i.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(2);
  });
});

describe("Notice / ActionRow", () => {
  it("error notice is an alert, info is status", () => {
    render(<><Notice tone="error">Bad</Notice><Notice>Fine</Notice></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
    expect(screen.getByRole("status")).toHaveTextContent("Fine");
  });
  it("disabled ActionRow shows its reason permanently and does not fire", () => {
    const onClick = vi.fn();
    render(<ActionRow label="Move" sublabel="Pick a day" disabledReason="Locked" onClick={onClick} />);
    const b = screen.getByRole("button", { name: /Move/ });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Locked")).toBeVisible();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});
