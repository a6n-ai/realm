// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GroupsTableSkeleton } from "../groups-table"

afterEach(cleanup)

describe("GroupsTableSkeleton", () => {
  it("has no serial # column, matching the live DataTable", () => {
    const { container } = render(<GroupsTableSkeleton />)
    const heads = Array.from(container.querySelectorAll("th")).map((th) => th.textContent)
    expect(heads).not.toContain("#")
  })
})
