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
    const start = (document as unknown as { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (reduce || typeof start !== "function") {
      e.preventDefault();
      router.push(url);
      return;
    }
    e.preventDefault();
    start(() => router.push(url));
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
