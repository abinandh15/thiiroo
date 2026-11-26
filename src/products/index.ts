import type { TemplateDescriptor } from '../lib/geometry';
import { DEFAULT_TEMPLATE } from '../lib/geometry';

/** Phase 2: products are pluggable modules. Each carries its identity, its Amazon
 *  listing, and the physical sheet template its orders print onto. Routes and the
 *  sidebar are generated from this registry. */
export interface ProductVariant {
  asin: string;
  /** prints per unit ordered */
  packSize: number;
}

export interface Product {
  id: string;
  name: string;
  /** primary (smallest pack) ASIN, shown in the sidebar */
  asin: string;
  /** every child ASIN of the listing — Amazon sells each pack size as its own ASIN */
  variants: ProductVariant[];
  /** short physical size label shown in the sidebar, e.g. "4×3in" */
  sizeLabel: string;
  /** verified factory template; per-machine edits live in the store as overrides */
  template: TemplateDescriptor;
  /** true for products created in the app from an SVG (Add product); stored on this machine */
  custom?: boolean;
}

export const instantPhotoPrints: Product = {
  id: 'instant-photo-prints',
  name: 'Instant Photo Prints',
  asin: 'B0HB4CYFG3',
  // from the amazon.in listing's variation picker, 2026-11-13
  variants: [
    { asin: 'B0HB4CYFG3', packSize: 6 },
    { asin: 'B0HB5VZ67B', packSize: 12 },
    { asin: 'B0HB5MTKDP', packSize: 18 },
    { asin: 'B0HB5KK63G', packSize: 24 },
    { asin: 'B0HB5YQPCZ', packSize: 30 },
  ],
  sizeLabel: '4×3in',
  template: DEFAULT_TEMPLATE,
};

/** products that ship with the app */
export const BUILTIN_PRODUCTS: Product[] = [instantPhotoPrints];

const CUSTOM_LS_KEY = 'thiiroo-custom-products';

function loadCustomProducts(): Product[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_LS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && p.id && p.template) : [];
  } catch {
    return [];
  }
}

let customProducts: Product[] = loadCustomProducts();

export function getCustomProducts(): Product[] {
  return customProducts;
}

/** Persist the custom product list. Throws when the browser's storage quota is exceeded. */
export function saveCustomProducts(next: Product[]): void {
  localStorage.setItem(CUSTOM_LS_KEY, JSON.stringify(next));
  customProducts = next;
}

export function listProducts(): Product[] {
  return [...BUILTIN_PRODUCTS, ...customProducts];
}

export function getProduct(id: string): Product | undefined {
  return listProducts().find((p) => p.id === id);
}

/** url-safe id from a product name, unique within the registry */
export function newProductId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  let id = base;
  for (let n = 2; getProduct(id); n++) id = `${base}-${n}`;
  return id;
}

const ASIN_LS_KEY = 'thiiroo-learned-asins';

/** An ASIN the user tied to a product while assigning an order by hand ("remember this ASIN"). */
export interface LearnedAsin {
  productId: string;
  packSize: number;
}

function loadLearnedAsins(): Record<string, LearnedAsin> {
  try {
    const raw = JSON.parse(localStorage.getItem(ASIN_LS_KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

let learnedAsins: Record<string, LearnedAsin> = loadLearnedAsins();

export function getLearnedAsins(): Record<string, LearnedAsin> {
  return learnedAsins;
}

export function saveLearnedAsins(next: Record<string, LearnedAsin>): void {
  localStorage.setItem(ASIN_LS_KEY, JSON.stringify(next));
  learnedAsins = next;
}

/** Every ASIN that routes to a product: the listed variants, then the learned ones. */
export function productAsins(product: Product): ProductVariant[] {
  const learned = Object.entries(learnedAsins)
    .filter(([asin, l]) => l.productId === product.id && !product.variants.some((v) => v.asin === asin))
    .map(([asin, l]) => ({ asin, packSize: l.packSize }));
  return [...product.variants, ...learned];
}

/** Resolve an order's ASIN (any pack size) to its product and variant.
 *  A product's own variant list wins over a learned ASIN. */
export function findByAsin(asin: string): { product: Product; variant: ProductVariant } | undefined {
  if (!asin) return undefined;
  for (const product of listProducts()) {
    const variant = product.variants.find((v) => v.asin === asin);
    if (variant) return { product, variant };
  }
  const learned = learnedAsins[asin];
  const product = learned && getProduct(learned.productId);
  return product ? { product, variant: { asin, packSize: learned.packSize } } : undefined;
}

/** The product an order prints as: a template picked by hand wins, otherwise the ASIN decides.
 *  undefined = unassigned (unknown ASIN and nothing picked, or the picked product was deleted). */
export function resolveProduct(order: { asin: string; productId?: string }): Product | undefined {
  return (order.productId ? getProduct(order.productId) : undefined) ?? findByAsin(order.asin)?.product;
}

/** Pack size an order's ASIN was sold as; undefined when the ASIN isn't in the registry.
 *  Derived from the stored ASIN, so it also works for orders imported before variants existed. */
export function packSizeOf(order: { asin: string }): number | undefined {
  return findByAsin(order.asin)?.variant.packSize;
}

/** Warning line when the zip's photo count disagrees with the pack size bought,
 *  or the ASIN is unknown and no template was picked. undefined when everything lines up. */
export function packWarning(order: {
  asin: string;
  productId?: string;
  photos: { length: number };
}): string | undefined {
  if (!order.asin) return undefined;
  const pack = packSizeOf(order);
  if (pack === undefined) {
    return resolveProduct(order) ? undefined : `ASIN ${order.asin} is not in the product registry`;
  }
  const n = order.photos.length;
  if (n !== pack) return `Pack of ${pack} ordered but zip has ${n} photo${n === 1 ? '' : 's'}`;
  return undefined;
}

export function productPath(id: string, sub: string): string {
  return `/p/${id}/${sub}`;
}
