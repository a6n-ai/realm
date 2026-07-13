"use client";

import type { ComponentPropsWithoutRef } from "react";
import { motion, useReducedMotion } from "motion/react";

type PressableProps = ComponentPropsWithoutRef<typeof motion.button> & { scale?: number };

export function Pressable({ scale = 0.97, children, ...rest }: PressableProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button whileTap={reduce ? undefined : { scale }} {...rest}>
      {children}
    </motion.button>
  );
}
