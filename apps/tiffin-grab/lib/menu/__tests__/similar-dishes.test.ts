import { describe, expect, it } from "vitest";
import { dishNameKey, findSimilarDishes } from "../similar-dishes";

describe("dishNameKey", () => {
  it.each([
    ["Aloo Zeera", "Aloo Jeera"],
    ["Chicken Methiwala", "Methi Chicken"],
    ["Chicken Makhani", "Butter Chicken"],
    ["Cabbage Matar", "Patta Gobhi Matar"],
    ["Boondi Raita (Non-Veg)", "Boondi Raita"],
    ["Kadiii", "Kadi"],
    ["Moong Daal", "moong dal"],
    ["Mixed vegs", "Mixed Veg"],
    ["Lauki Chanadal", "Lauki Chana Dal"],
  ])("%s == %s", (a, b) => expect(dishNameKey(a)).toBe(dishNameKey(b)));

  it("keeps different dishes apart", () => {
    expect(dishNameKey("Kadai Paneer")).not.toBe(dishNameKey("Kadai Chicken"));
    expect(dishNameKey("Aloo Methi")).not.toBe(dishNameKey("Aloo Matar"));
  });
});

describe("findSimilarDishes", () => {
  const catalog = [{ name: "Rongi Dal" }, { name: "Moong Dal Tadka" }, { name: "Shahi Paneer" }, { name: "Chicken Kofta Curry" }];

  it("flags subset and typo matches", () => {
    expect(findSimilarDishes("Rongi", catalog).map((d) => d.name)).toEqual(["Rongi Dal"]);
    expect(findSimilarDishes("Moong Tadka", catalog).map((d) => d.name)).toEqual(["Moong Dal Tadka"]);
    expect(findSimilarDishes("Chicken kofta", catalog).map((d) => d.name)).toEqual(["Chicken Kofta Curry"]);
    expect(findSimilarDishes("Shahi Paner", catalog).map((d) => d.name)).toEqual(["Shahi Paneer"]);
  });

  it("stays quiet for new dishes", () => {
    expect(findSimilarDishes("Butter Chicken", catalog)).toEqual([]);
    expect(findSimilarDishes("", catalog)).toEqual([]);
  });
});
