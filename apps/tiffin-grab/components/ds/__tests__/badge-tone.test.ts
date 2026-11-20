import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const ADMIN_DIRS = ["app/(dashboard)", "components/dashboard", "components/ds", "components/filters", "components/notifications", "components/reui"]

// Admin tokens.css paints every [data-slot=badge] from --ui-badge-tone and is unlayered, so a colour class
// on a Badge is silently overridden. Sizes and layout utilities are not colours and are not flagged.
const SIZE_OR_LAYOUT = /^(text-(xs|sm|base|lg|xl|\dxl|caption(-\d)?|footnote|subhead|callout|body|title-\d|large-title|left|center|right|start|end|justify|ellipsis|clip-text|wrap|nowrap|balance|pretty)|text-\[[\d.]+(px|rem|em)\]|text-\((length|size):|bg-clip-\w+|bg-(none|cover|contain|center|no-repeat|fixed|local|scroll))$/
const COLOUR_CLASS = /(?<![\w-])(bg|text)-[^\s"'`)},;]+/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(path)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : []
  })
}

// JSX opening tags can hold `{...}` expressions with `>` in them, so the tag ends at the first `>` outside braces.
function openingTags(src: string, element = /<Badge(?=[\s>/])/g): { start: number; text: string }[] {
  const tags: { start: number; text: string }[] = []
  for (const match of src.matchAll(element)) {
    const start = match.index ?? 0
    let depth = 0
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") depth--
      else if (src[i] === ">" && depth === 0) {
        tags.push({ start, text: src.slice(start, i + 1) })
        break
      }
    }
  }
  return tags
}

// A className built from a same-file constant is checked through its declaration; `.prop` narrows to that key.
function declarationText(src: string, name: string): string {
  const decl = new RegExp(`(?:\\b(?:const|let|var)\\s+${name}\\b|^\\s*${name}\\s*:)`, "m").exec(src)
  if (!decl) return ""
  const value = /(?:=|:)\s*[{[(]/.exec(src.slice(decl.index))
  if (!value || value.index > 200) return src.slice(decl.index, src.indexOf("\n", decl.index))
  let depth = 0
  for (let i = decl.index + value.index + value[0].length - 1; i < src.length; i++) {
    if ("{[(".includes(src[i])) depth++
    else if ("}])".includes(src[i]) && --depth === 0) return src.slice(decl.index, i + 1)
  }
  return ""
}

function colourClasses(text: string): string[] {
  return [...text.matchAll(COLOUR_CLASS)].map((m) => m[0]).filter((c) => !SIZE_OR_LAYOUT.test(c))
}

function colourViolations(): string[] {
  return ADMIN_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).flatMap((file) => {
    const src = readFileSync(file, "utf8")
    // A `pill` string is handed to a Badge by a caller (TonePill), so the string itself is checked.
    const pills = [...src.matchAll(/\bpill:\s*"([^"]*)"/g)].flatMap((m) => {
      const found = colourClasses(m[1])
      return found.length === 0 ? [] : [`${relative(ROOT, file)}:${src.slice(0, m.index).split("\n").length}: ${found.join(" ")}`]
    })
    return [...pills, ...openingTags(src).flatMap(({ start, text }) => {
      const found = [
        ...colourClasses(text),
        ...[...text.matchAll(/className=\{([^}]*)\}/g)].flatMap((m) =>
          [...m[1].matchAll(/([A-Za-z_]\w*)(?:\[[^\]]*\])?(?:\.(\w+))?/g)].flatMap(([, id, prop]) => {
            if (["cn", "true", "false", "null", "undefined"].includes(id)) return []
            if (!prop) return colourClasses(declarationText(src, id))
            return [...src.matchAll(new RegExp(`\\b${prop}:\\s*"([^"]*)"`, "g"))].flatMap((v) => colourClasses(v[1]))
          })
        ),
      ]
      if (found.length === 0) return []
      const line = src.slice(0, start).split("\n").length
      return [`${relative(ROOT, file)}:${line}: ${found.join(" ")}`]
    })]
  })
}

// Status pills hand-built from rounded-full + padding + text size. Chips and buttons the review listed as non-status are allowed by file.
const PILL_ALLOW = [
  "app/(dashboard)/dashboard/tickets/[id]/chat-pane.tsx",
  "components/dashboard/app-clock.tsx",
  "components/dashboard/notification-bell.tsx",
  "components/dashboard/notification-bell-mount.tsx",
  "app/(dashboard)/dashboard/catalog/meal-rules/rule-builder.tsx",
  "components/payment-instructions.tsx",
  "components/ui/bubble.tsx",
]

function isHandRolledPill(tag: string): boolean {
  return /(?<![\w-])rounded-full(?![\w-])/.test(tag) && /(?<![\w-])px-2(\.5)?(?![\w-])/.test(tag) && /(?<![\w-])text-(xs|\[10px\])(?![\w-])/.test(tag)
}

function handRolledPills(): string[] {
  return ADMIN_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).flatMap((file) => {
    const rel = relative(ROOT, file)
    if (PILL_ALLOW.includes(rel)) return []
    const src = readFileSync(file, "utf8")
    return openingTags(src, /<(span|button)(?=[\s>])/g).flatMap(({ start, text }) =>
      isHandRolledPill(text) ? [`${rel}:${src.slice(0, start).split("\n").length}`] : []
    )
  })
}

describe("admin Badges take their colour from --ui-badge-tone", () => {
  it("no <Badge> in the admin dirs sets a bg-* or text colour utility", () => {
    expect(colourViolations()).toEqual([])
  })
  it("no status pill is hand-built as a rounded-full span or button; status pills render <Badge>", () => {
    expect(handRolledPills()).toEqual([])
  })
})
