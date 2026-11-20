import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { badgeTone } from "@foundry/ui/badge"

import { Badge, badgeVariants, type BadgeProps } from "./badge"

const toneOf: Record<NonNullable<BadgeProps["variant"]>, keyof typeof badgeTone> = {
  default: "brand",
  outline: "neutral",
  secondary: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "danger",
  focus: "brand",
  invert: "neutral",
  "primary-light": "brand",
  "warning-light": "warning",
  "success-light": "success",
  "info-light": "info",
  "destructive-light": "danger",
  "invert-light": "neutral",
  "focus-light": "brand",
  "primary-outline": "brand",
  "warning-outline": "warning",
  "success-outline": "success",
  "info-outline": "info",
  "destructive-outline": "danger",
  "invert-outline": "neutral",
  "focus-outline": "brand",
}

describe("ReUI Badge variants resolve to the shared admin tones", () => {
  it.each(Object.entries(toneOf))("%s sets the %s tone", (variant, tone) => {
    expect(badgeVariants({ variant: variant as BadgeProps["variant"] })).toContain(badgeTone[tone])
  })

  it("customer callers keep today's light classes", () => {
    expect(badgeVariants({ variant: "success-light" })).toContain("bg-success/10 text-success-foreground")
    expect(badgeVariants({ variant: "destructive" })).toContain("bg-destructive text-white")
  })

  it("marks its size so the admin rule can collapse it to one pill height", () => {
    expect(renderToStaticMarkup(<Badge>x</Badge>)).toContain('data-size="default"')
    expect(renderToStaticMarkup(<Badge size="sm">x</Badge>)).toContain('data-size="sm"')
  })
})
