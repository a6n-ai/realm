// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AddressTagPicker } from "../address-tag-picker";

function Harness({ initial = "", taken = new Map([["Home", "12 King St"]]) }: { initial?: string; taken?: Map<string, string> }) {
  const [tag, setTag] = useState(initial);
  return (
    <>
      <AddressTagPicker value={tag} onChange={setTag} takenBy={taken} />
      <output data-testid="tag">{tag}</output>
    </>
  );
}

afterEach(cleanup);

describe("AddressTagPicker", () => {
  it("offers Home / Office / Other, greying a tag another address already has", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Home" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Why Home is unavailable" }));
    expect(screen.getByText("Home: Already used for 12 King St")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Office" }));
    expect(screen.getByTestId("tag")).toHaveTextContent("Office");
  });

  it("takes a new tag of the customer's own, and flags one already in use", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "+ New tag" }));
    const input = screen.getByLabelText("New tag");
    fireEvent.change(input, { target: { value: "Mom's place" } });
    expect(screen.getByTestId("tag")).toHaveTextContent("Mom's place");
    fireEvent.change(input, { target: { value: "home" } });
    expect(screen.getByText('You already have an address tagged "Home"')).toBeInTheDocument();
  });

  it("opens an address's own custom tag in the text box", () => {
    render(<Harness initial="Gym" taken={new Map()} />);
    expect(screen.getByRole("radio", { name: "+ New tag" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("New tag")).toHaveValue("Gym");
  });
});
