// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PaymentStatusPill } from "./payment-status-pill"

afterEach(cleanup)

const badge = (status: string) =>
  render(<PaymentStatusPill status={status} />).container.querySelector('[data-slot="badge"]')

describe("PaymentStatusPill renders the Badge with the payment tone", () => {
  it("maps paid to ok, pending_verification to warn and refunded to bad", () => {
    expect(badge("paid")).toHaveClass("[--ui-badge-tone:var(--ok)]")
    expect(badge("pending_verification")).toHaveClass("[--ui-badge-tone:var(--warn)]")
    expect(badge("refunded")).toHaveClass("[--ui-badge-tone:var(--bad)]")
  })
})
