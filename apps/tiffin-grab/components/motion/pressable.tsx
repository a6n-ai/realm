"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

type PressableProps = ComponentPropsWithoutRef<typeof m.button> & { scale?: number };

export function Pressable({ scale = 0.97, children, ...rest }: PressableProps) {
  const reduce = useReducedMotion();
  return (
    <m.button whileTap={reduce ? undefined : { scale }} {...rest}>
      {children}
    </m.button>
  );
}
