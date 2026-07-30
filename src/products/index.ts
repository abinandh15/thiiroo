import type { TemplateDescriptor } from '../lib/geometry';
import { DEFAULT_TEMPLATE } from '../lib/geometry';

/** Phase 2: products are pluggable modules. Each carries its identity, its Amazon
 *  listing, and the physical sheet template its orders print onto. Routes and the
 *  sidebar are generated from this registry. */
export interface Product {
  id: string;
  name: string;
  asin: string;
  /** short physical size label shown in the sidebar, e.g. "4×3in" */
  sizeLabel: string;
  /** verified factory template; per-machine edits live in the store as overrides */
  template: TemplateDescriptor;
}

export const instantPhotoPrints: Product = {
  id: 'instant-photo-prints',
  name: 'Instant Photo Prints',
  asin: 'B0HB4CYFG3',
  sizeLabel: '4×3in',
  template: DEFAULT_TEMPLATE,
};

export const PRODUCTS: Product[] = [instantPhotoPrints];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function productPath(id: string, sub: string): string {
  return `/p/${id}/${sub}`;
}
