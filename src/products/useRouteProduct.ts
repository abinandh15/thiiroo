import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { effectiveTemplate, useStore } from '../store';
import type { Order } from '../lib/types';
import { aspectMismatch, photoFrame } from '../lib/geometry';
import type { TemplateDescriptor } from '../lib/geometry';
import { getProduct, instantPhotoPrints, resolveProduct } from './index';
import type { Product } from './index';

/** The product named by the `/p/:productId` route. Falls back to the built-in one only for the
 *  instant the route gate has not redirected yet. Re-renders when custom products change. */
export function useRouteProduct(): Product {
  const { productId } = useParams();
  useStore((s) => s.customProducts);
  return (productId ? getProduct(productId) : undefined) ?? instantPhotoPrints;
}

/** Orders that resolve to this product (manual pick first, then ASIN). */
export function useProductOrders(product: Product): Order[] {
  const orders = useStore((s) => s.orders);
  const customProducts = useStore((s) => s.customProducts);
  return useMemo(
    () => orders.filter((o) => resolveProduct(o)?.id === product.id),
    // customProducts: a deleted/added product changes what resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, product.id, customProducts]
  );
}

/** The product's template with this machine's overrides applied. */
export function useProductTemplate(product: Product): TemplateDescriptor {
  return useStore((s) => effectiveTemplate(s, product.id));
}

const mm = (v: number) => String(Math.round(v * 10) / 10);

/** Warning when the buyer's crop window has a different shape than this template's photo frame,
 *  judged on the order's first non-missing photo. undefined when it fits. */
export function aspectWarning(order: Order, template: TemplateDescriptor): string | undefined {
  const p = order.photos.find((x) => !x.missing);
  if (!p) return undefined;
  const frame = photoFrame(template);
  if (!aspectMismatch(p.crop, frame)) return undefined;
  return `Crop is ${p.crop.w}×${p.crop.h} but this template's frame is ${mm(frame.w)} × ${mm(frame.h)} mm — the print trims the edges to fill it.`;
}
