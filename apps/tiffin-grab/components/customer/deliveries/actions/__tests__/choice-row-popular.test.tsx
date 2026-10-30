// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChoiceRow, PopularDishes } from "../choice-row";

afterEach(cleanup);

describe("ChoiceRow popular tag", () => {
  it("tags the day's popular dishes, never a swap", () => {
    render(
      <PopularDishes.Provider value={new Set(["Palak Paneer", "Rice"])}>
        <ChoiceRow
          label="Sabzi"
          value=""
          onChange={() => {}}
          choices={[
            { value: "a", label: "Palak Paneer" },
            { value: "b", label: "Aloo Gobi" },
            { value: "c", label: "Rice", swap: true },
          ]}
        />
      </PopularDishes.Provider>,
    );
    expect(within(screen.getByRole("radio", { name: /Palak Paneer/ })).getByText("Popular")).toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: /Aloo Gobi/ })).queryByText("Popular")).toBeNull();
    expect(within(screen.getByRole("radio", { name: /Rice/ })).queryByText("Popular")).toBeNull();
  });
});
