import type { Order, Photo } from './types';
import { SLOTS_PER_SHEET } from './geometry';

export interface SlotFill {
  photo: Photo;
  orderId: string;
}

export interface SheetModel {
  /** unique order ids appearing on this sheet, in slot order */
  orderIds: string[];
  slots: (SlotFill | null)[];
  /** e.g. "copy 2 of 3" for qty > 1 */
  copyNote?: string;
}

function printablePhotos(o: Order): Photo[] {
  return o.photos.filter((p) => !p.missing);
}

/** strict: one order per sheet-set; combine: pack part sheets across orders */
export function buildSheets(orders: Order[], mode: 'strict' | 'combine'): SheetModel[] {
  const sheets: SheetModel[] = [];
  if (mode === 'strict') {
    for (const o of orders) {
      const photos = printablePhotos(o);
      const perCopy: SheetModel[] = [];
      for (let i = 0; i < photos.length; i += SLOTS_PER_SHEET) {
        const chunk = photos.slice(i, i + SLOTS_PER_SHEET);
        const slots: (SlotFill | null)[] = Array.from({ length: SLOTS_PER_SHEET }, (_, j) =>
          chunk[j] ? { photo: chunk[j], orderId: o.id } : null
        );
        perCopy.push({ orderIds: [o.id], slots });
      }
      if (!perCopy.length) continue;
      for (let c = 0; c < o.qty; c++) {
        for (const s of perCopy) {
          sheets.push({
            ...s,
            slots: [...s.slots],
            copyNote: o.qty > 1 ? `copy ${c + 1} of ${o.qty}` : undefined,
          });
        }
      }
    }
  } else {
    const fills: SlotFill[] = [];
    for (const o of orders) {
      const photos = printablePhotos(o);
      for (let c = 0; c < o.qty; c++) for (const p of photos) fills.push({ photo: p, orderId: o.id });
    }
    for (let i = 0; i < fills.length; i += SLOTS_PER_SHEET) {
      const chunk = fills.slice(i, i + SLOTS_PER_SHEET);
      const slots: (SlotFill | null)[] = Array.from({ length: SLOTS_PER_SHEET }, (_, j) => chunk[j] ?? null);
      const ids: string[] = [];
      for (const f of chunk) if (!ids.includes(f.orderId)) ids.push(f.orderId);
      sheets.push({ orderIds: ids, slots });
    }
  }
  return sheets;
}

export function blankCount(s: SheetModel): number {
  return s.slots.filter((x) => !x).length;
}
