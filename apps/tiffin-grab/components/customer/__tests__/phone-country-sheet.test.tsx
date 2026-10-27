// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PhoneCountrySheet } from "../phone-country-sheet";

afterEach(cleanup);

const options = [
  { label: "International" },
  { label: "Afghanistan", value: "AF" as const },
  { label: "Canada", value: "CA" as const },
  { label: "India", value: "IN" as const },
];

describe("PhoneCountrySheet", () => {
  it("pins the picked country first, searches by name or code, and picks on tap", async () => {
    const onChange = vi.fn();
    render(<PhoneCountrySheet value="CA" onChange={onChange} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Country: Canada" }));
    const list = await screen.findByRole("listbox", { name: "Country" });
    expect(within(list).getAllByRole("option").map((o) => o.querySelector(".truncate")?.textContent)).toEqual(["Canada", "Afghanistan", "India"]);

    fireEvent.change(screen.getByPlaceholderText(/search country/i), { target: { value: "+91" } });
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /India/ }));
    expect(onChange).toHaveBeenCalledWith("IN");
  });
});
