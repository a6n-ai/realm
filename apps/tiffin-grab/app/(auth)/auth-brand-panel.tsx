import { BrandMark, BrandWordmark } from "@/components/brand-logo";

export function AuthBrandPanel() {
  return (
    <div className="bg-muted text-muted-foreground relative hidden flex-col items-center justify-center gap-2 p-8 md:flex">
      <BrandMark className="mb-1 size-20" />
      <BrandWordmark className="text-2xl" />
      <p className="text-balance text-center text-sm">Fresh tiffin meals, delivered on your schedule.</p>
    </div>
  );
}
