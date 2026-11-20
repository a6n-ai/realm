import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = fileURLToPath(new URL("../..", import.meta.url));
const SWEPT = ["app/(dashboard)", "components/dashboard", "components/ds", "components/reui", "components/ui", "components/filters"];

const MOTION = /(?:^|[\s"'`{(,])(?:[^\s"'`:{}()]+:)*(?:hover|active|group-hover(?:\/[\w-]+)?|group-active(?:\/[\w-]+)?):[^\s"'`]*(?:scale|translate|rotate|shadow)/;
const TRANSITION_ALL = /(?:^|[\s"'`])transition-all(?=[\s"'`]|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

export function motionHit(text: string): boolean {
  return MOTION.test(text) || TRANSITION_ALL.test(text);
}

export function hoverPressMotionHits(): string[] {
  return SWEPT.flatMap((d) => sourceFiles(join(APP, d))).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((text, i) => (motionHit(text) ? [`${file}:${i + 1}`] : [])),
  );
}

describe("admin dashboard has no hover or press motion", () => {
  it("swept admin dirs carry no hover/press scale, translate, rotate or shadow, and no transition-all", () => {
    expect(hoverPressMotionHits()).toEqual([]);
  });

  it.each([
    'className="hover:shadow-md"',
    'className="group-hover/stat:shadow-md"',
    'className="group-hover:shadow-lg"',
    'className="data-[state=open]:hover:scale-105"',
    'className="hover:-translate-y-0.5"',
    'className="active:scale-(--ui-press-scale)"',
    'className="transition-all duration-200"',
  ])("flags %s", (line) => {
    expect(motionHit(line)).toBe(true);
  });

  it.each([
    'className="hover:bg-muted/50 transition-colors"',
    'className="data-[state=open]:bg-accent"',
    'className="motion-safe:duration-200"',
    'className="transition-[border-color,box-shadow]"',
  ])("allows %s", (line) => {
    expect(motionHit(line)).toBe(false);
  });
});
