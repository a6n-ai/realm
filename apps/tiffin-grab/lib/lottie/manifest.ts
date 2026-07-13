export type LottieName =
  | "empty-box" | "delivery-scooter" | "success-check"
  | "coin-burst" | "loading" | "celebrate";

export interface LottieAsset {
  path: string;
  license: string;
  attribution: string;
  source: string;
}

// Every entry is a free-for-commercial LottieFiles animation. Keep attribution +
// source accurate — the manifest test enforces presence, licensing is on us.
export const LOTTIE: Record<LottieName, LottieAsset> = {
  "empty-box": { path: "/lottie/empty-box.json", license: "Lottie Simple License", attribution: "Animo Arts", source: "https://lottiefiles.com/free-animation/empty-box-uNf2uP0OdP" },
  "delivery-scooter": { path: "/lottie/delivery-scooter.json", license: "Lottie Simple License", attribution: "Angelo", source: "https://lottiefiles.com/free-animation/food-delivery-driver-P1vP76ArqZ" },
  "success-check": { path: "/lottie/success-check.json", license: "Lottie Simple License", attribution: "Pranav Patil", source: "https://lottiefiles.com/free-animation/success-check-zSLSFlcAJq" },
  "coin-burst": { path: "/lottie/coin-burst.json", license: "Lottie Simple License", attribution: "Artyom Konakov", source: "https://lottiefiles.com/free-animation/coins-blow-effect-2YdQmUbuTz" },
  "loading": { path: "/lottie/loading.json", license: "Lottie Simple License", attribution: "Umer Khawer", source: "https://lottiefiles.com/free-animation/loading-dots-HwAkIBsN3z" },
  "celebrate": { path: "/lottie/celebrate.json", license: "Lottie Simple License", attribution: "Deepesh Reddy", source: "https://lottiefiles.com/free-animation/success-confetti-f5PdexvrBK" },
};

export function lottiePath(name: LottieName): string {
  return LOTTIE[name].path;
}
