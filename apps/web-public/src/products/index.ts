import { medcoreProduct } from "./medcore";
import { proformafarmProduct } from "./proformafarm";
import type { Product } from "./types";

export const productsBySlug: Record<string, Product> = {
  [proformafarmProduct.slug]: proformafarmProduct,
  [medcoreProduct.slug]: medcoreProduct,
};

export const productSlugs = Object.keys(productsBySlug);
