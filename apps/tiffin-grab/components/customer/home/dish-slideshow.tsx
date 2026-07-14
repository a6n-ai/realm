"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CustomerDish } from "@/lib/services/dishes.service";
import { DishImage } from "./dish-image";

const ADVANCE_MS = 3000;

// Autoplay dish-photo carousel: crossfades through the pool via opacity,
// reduced-motion users get a static first frame (no interval, no animation).
export function DishSlideshow({ dishes, className }: { dishes: CustomerDish[]; className?: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce || dishes.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % dishes.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [reduce, dishes.length]);

  if (dishes.length === 0) return null;

  const active = dishes[Math.min(index, dishes.length - 1)];

  if (reduce) {
    return (
      <div className={className}>
        <DishImage image={active.image} name={active.name} />
      </div>
    );
  }

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="h-full w-full"
        >
          <DishImage image={active.image} name={active.name} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
