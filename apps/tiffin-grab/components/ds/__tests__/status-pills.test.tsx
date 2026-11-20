// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OrderStatusBadge } from "../order-status-badge"
import { StageBadge } from "../stage-badge"
import { TonePill } from "../tone-pill"

afterEach(cleanup)

const badge = (ui: React.ReactElement) => render(ui).container.querySelector('[data-slot="badge"]')

describe("OrderStatusBadge renders the Badge with the status tone", () => {
  it("maps ok, warn and bad to the --ok, --warn and --bad tokens", () => {
    expect(badge(<OrderStatusBadge status="active" />)).toHaveClass("[--ui-badge-tone:var(--ok)]")
    expect(badge(<OrderStatusBadge status="waitlisted" />)).toHaveClass("[--ui-badge-tone:var(--warn)]")
    expect(badge(<OrderStatusBadge status="cancelled" />)).toHaveClass("[--ui-badge-tone:var(--bad)]")
  })

  it("leaves neutral statuses on the default muted tone", () => {
    expect(badge(<OrderStatusBadge status="completed" />)).toHaveClass("[--ui-badge-tone:var(--muted-foreground)]")
  })
})

describe("TonePill renders the Badge with the tone", () => {
  it("maps brand to primary and the status tones to ok, warn and bad", () => {
    expect(badge(<TonePill tone="brand">b</TonePill>)).toHaveClass("[--ui-badge-tone:var(--primary)]")
    expect(badge(<TonePill tone="ok">o</TonePill>)).toHaveClass("[--ui-badge-tone:var(--ok)]")
    expect(badge(<TonePill tone="warn">w</TonePill>)).toHaveClass("[--ui-badge-tone:var(--warn)]")
    expect(badge(<TonePill tone="bad">x</TonePill>)).toHaveClass("[--ui-badge-tone:var(--bad)]")
  })

  it("draws faint as neutral with no dashed border", () => {
    const el = badge(<TonePill tone="faint">f</TonePill>)
    expect(el).toHaveClass("[--ui-badge-tone:var(--muted-foreground)]")
    expect(el).not.toHaveClass("border-dashed")
  })
})

describe("StageBadge renders the Badge with the stage tone", () => {
  it("maps a new lead to ok", () => {
    expect(badge(<StageBadge stage="new" />)).toHaveClass("[--ui-badge-tone:var(--ok)]")
  })
})
