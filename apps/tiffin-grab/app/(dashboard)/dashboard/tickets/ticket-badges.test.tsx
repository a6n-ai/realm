// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PriorityBadge, TicketStatusBadge } from "./ticket-badges"

afterEach(cleanup)

const badge = (ui: React.ReactElement) => render(ui).container.querySelector('[data-slot="badge"]')

describe("ticket status and priority render the Badge with their tone", () => {
  it("maps open to warn and in_progress to ok", () => {
    expect(badge(<TicketStatusBadge status="open" />)).toHaveClass("[--ui-badge-tone:var(--warn)]")
    expect(badge(<TicketStatusBadge status="in_progress" />)).toHaveClass("[--ui-badge-tone:var(--ok)]")
  })

  it("maps urgent priority to bad", () => {
    expect(badge(<PriorityBadge priority="urgent" />)).toHaveClass("[--ui-badge-tone:var(--bad)]")
  })
})
