/** Shared row shapes for the coverage screen — the page maps DB rows into these. */

export type ZoneRow = {
  publicId: string;
  name: string;
  radiusKm: number;
  active: boolean;
  typePublicIds: string[];
};

export type TypeOption = { publicId: string; key: string; label: string; active: boolean };
