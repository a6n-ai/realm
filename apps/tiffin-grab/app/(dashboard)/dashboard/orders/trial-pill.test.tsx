// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TrialPill } from "./trial-pill"

afterEach(cleanup)

describe("TrialPill renders the Badge in its amber tone", () => {
  it("sets the amber tone for light and dark", () => {
    render(<TrialPill />)
    const el = screen.getByText("Trial").closest('[data-slot="badge"]')
    expect(el).toHaveClass("[--ui-badge-tone:var(--color-amber-700)]", "dark:[--ui-badge-tone:var(--color-amber-300)]")
  })
})
