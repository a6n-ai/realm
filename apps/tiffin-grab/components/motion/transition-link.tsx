"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";

type TransitionLinkProps = ComponentProps<typeof Link>;

export function TransitionLink({ href, onClick, ...rest }: TransitionLinkProps) {
  const router = useRouter();
  const reduce = useReducedMotion();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (typeof href !== "string") return;
    const url = href;
    // Must call via `document` — extracting the method loses `this` and throws Illegal invocation.
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    e.preventDefault();
    if (reduce || typeof doc.startViewTransition !== "function") {
      router.push(url);
      return;
    }
    try {
      doc.startViewTransition(() => {
        router.push(url);
      });
    } catch {
      router.push(url);
    }
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
