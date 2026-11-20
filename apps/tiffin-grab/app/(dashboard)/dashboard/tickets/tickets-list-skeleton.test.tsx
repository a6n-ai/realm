// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { STATUS_OPTIONS } from "@/lib/support/ticket-status"
import { TicketsListSkeleton } from "./tickets-list"

afterEach(cleanup)

describe("TicketsListSkeleton", () => {
  it("draws the status pills as inert buttons with the live labels", () => {
    const { container } = render(<TicketsListSkeleton />)
    const pills = Array.from(container.querySelectorAll("button[aria-pressed]"))
    expect(pills.map((b) => b.textContent)).toEqual(["All", ...STATUS_OPTIONS.map((o) => o.label), "Overdue"])
    expect(container.querySelector("[inert]")).not.toBeNull()
  })

  it("draws the owner select beside the search", () => {
    const { container } = render(<TicketsListSkeleton />)
    expect(container.querySelector(".h-8.w-40")).not.toBeNull()
  })
})
