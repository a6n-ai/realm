"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@realm/ui/cn";
import { transitions } from "@/lib/motion/tokens";

interface RevealProps { children: ReactNode; className?: string; delay?: number; }

// A group orchestrates its Reveal children with a stagger via motion variants.
const groupVariants = {
  hidden: {},
  show: { transition: { staggerChildren: transitions.stagger } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: transitions.easeBase },
};

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn(className)}>{children}</div>;
  return (
    <motion.div
      className={cn(className)}
      variants={itemVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      transition={{ ...transitions.easeBase, delay }}
    >
      {children}
    </motion.div>
  );
}

Reveal.Group = function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn(className)}>{children}</div>;
  return (
    <motion.div
      className={cn(className)}
      variants={groupVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
};
