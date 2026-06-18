import { createQueryRoute } from "@tiffin/commons-next";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(mealSizeService);
