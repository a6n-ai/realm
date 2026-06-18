import { createCollectionRoute } from "@tiffin/commons-next";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(mealSizeService);
