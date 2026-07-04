import type { ComponentProps } from "react";
import {
  Card as UiCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@realm/ui/card";
import { cn } from "@/lib/utils";

export type CardVariant = "glow" | "lift" | "flat";

export function cardVariantClass(variant: CardVariant = "glow"): string {
  if (variant === "lift") return "hover-lift";
  if (variant === "flat") return "border";
  return "card-glow";
}

export function Card({
  variant = "glow",
  className,
  ...props
}: ComponentProps<typeof UiCard> & { variant?: CardVariant }) {
  return <UiCard className={cn(cardVariantClass(variant), className)} {...props} />;
}

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
