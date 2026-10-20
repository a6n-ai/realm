// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewTicketForm } from "../new-ticket-form";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { createTicket } from "@/app/(customer)/me/support/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(customer)/me/support/actions", () => ({
  createTicket: vi.fn(),
}));

vi.mock("@foundry/design-system", () => ({
  makeImageThumbnail: vi.fn(),
}));

afterEach(cleanup);

describe("NewTicketForm - Order Selection with Meal Size", () => {
  it("renders order options with deploymentId, planName, and mealSizeName", () => {
    const orders = [
      {
        value: "ord_1",
        label: ["SUB-B7PERN", "Non-Veg Plan", "Maharaja"].filter(Boolean).join(" · "),
      },
      {
        value: "ord_2",
        label: ["SUB-X9Y8Z7", "Pure Vegetarian Plan", "Standard"].filter(Boolean).join(" · "),
      },
    ];

    render(
      <NewTicketForm
        categories={TICKET_CATEGORIES}
        orders={orders}
      />
    );

    const orderSelect = screen.getByLabelText(/Related plan \/ order/i) as HTMLSelectElement;
    expect(orderSelect).toBeInTheDocument();

    const options = Array.from(orderSelect.options).map((opt) => opt.text);
    expect(options).toContain("None");
    expect(options).toContain("SUB-B7PERN · Non-Veg Plan · Maharaja");
    expect(options).toContain("SUB-X9Y8Z7 · Pure Vegetarian Plan · Standard");
  });

  it("preselects defaultOrderId when provided", () => {
    const orders = [
      {
        value: "ord_1",
        label: "SUB-B7PERN · Non-Veg Plan · Maharaja",
      },
      {
        value: "ord_2",
        label: "SUB-X9Y8Z7 · Pure Vegetarian Plan · Standard",
      },
    ];

    render(
      <NewTicketForm
        categories={TICKET_CATEGORIES}
        orders={orders}
        defaultOrderId="ord_2"
      />
    );

    const orderSelect = screen.getByLabelText(/Related plan \/ order/i) as HTMLSelectElement;
    expect(orderSelect.value).toBe("ord_2");
  });

  it("omits the order field when no orders are provided", () => {
    render(
      <NewTicketForm
        categories={TICKET_CATEGORIES}
        orders={[]}
      />
    );

    expect(screen.queryByLabelText(/Related plan \/ order/i)).not.toBeInTheDocument();
  });

  it("correctly formats order labels with deploymentId, planName, and mealSizeName", () => {
    const ordersFromDashboard = [
      {
        publicId: "ord_1",
        deploymentId: "SUB-B7PERN",
        planName: "Non-Veg Plan",
        mealSizeName: "Maharaja",
      },
      {
        publicId: "ord_2",
        deploymentId: "SUB-A1B2C3",
        planName: "Vegetarian Plan",
        mealSizeName: "Standard",
      },
      {
        publicId: "ord_3",
        deploymentId: "SUB-EMPTY",
        planName: "Tiffin Plan",
        mealSizeName: "",
      },
    ];

    const orderOptions = ordersFromDashboard.map((o) => ({
      value: o.publicId,
      label: [o.deploymentId, o.planName, o.mealSizeName].filter(Boolean).join(" · "),
    }));

    expect(orderOptions).toEqual([
      { value: "ord_1", label: "SUB-B7PERN · Non-Veg Plan · Maharaja" },
      { value: "ord_2", label: "SUB-A1B2C3 · Vegetarian Plan · Standard" },
      { value: "ord_3", label: "SUB-EMPTY · Tiffin Plan" },
    ]);
  });
});

describe("NewTicketForm - submit errors", () => {
  it("replaces the browser's network error with a plain-language message", async () => {
    vi.mocked(createTicket).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<NewTicketForm categories={TICKET_CATEGORIES} orders={[]} />);

    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Missing roti" } });
    const category = screen.getByLabelText(/^category/i) as HTMLSelectElement;
    fireEvent.change(category, { target: { value: category.options[1].value } });
    const sub = screen.getByLabelText(/sub-category/i) as HTMLSelectElement;
    fireEvent.change(sub, { target: { value: sub.options[1].value } });
    fireEvent.change(document.getElementById("ticket-body")!, { target: { value: "Only 4 roti" } });
    fireEvent.submit(document.getElementById("ticket-body")!.closest("form")!);

    await waitFor(() => expect(screen.getByText(/Upload interrupted/)).toBeInTheDocument());
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });
});
