import { create } from 'zustand';
import type { ActivityEvent, ImportProgress, Order, Photo, Placement } from './lib/types';
import { cropPhoto, parseOrderZip } from './lib/ingest';
import { DEFAULT_TEMPLATE, DPI_FLOOR, photoFrame, printDpi, slotsPerSheet } from './lib/geometry';
import type { TemplateDescriptor } from './lib/geometry';
import {
  findByAsin,
  getCustomProducts,
  getLearnedAsins,
  getProduct,
  resolveProduct,
  saveCustomProducts,
  saveLearnedAsins,
} from './products';
import type { Product } from './products';
import { deleteActivityFor, deleteOrder, loadActivity, loadOrders, logActivity, saveOrder } from './lib/persist';

export const orderKey = (o: Pick<Order, 'id' | 'itemId'>) => `${o.id}::${o.itemId}`;

/** The template an order prints with: its product's (override-aware), or the Instant Photo
 *  Prints one while the order is still unassigned. */
export function orderTemplate(o: Pick<Order, 'asin' | 'productId'>): TemplateDescriptor {
  const p = resolveProduct(o);
  return p ? effectiveTemplate(useStore.getState(), p.id) : DEFAULT_TEMPLATE;
}
export function sheetsPerCopy(o: Order): number {
  return Math.max(1, Math.ceil(o.photos.length / Math.max(1, slotsPerSheet(orderTemplate(o)))));
}
export function sheetCount(o: Order): number {
  return sheetsPerCopy(o) * o.qty;
}
export function effectivePlacement(p: Photo): Placement {
  return p.override ?? p.buyerPlacement;
}
export function allApproved(o: Order): boolean {
  return o.photos.every((p) => p.approved || p.missing);
}

export interface FailedImport {
  fileName: string;
  message: string;
  file: File;
}

/** a re-imported zip whose order is already in the queue; the fresh parse is held
 *  so "Replace anyway" can apply it without re-decoding */
export interface DuplicateImport {
  fileName: string;
  fresh: Order;
  existingStatus: Order['status'];
}

interface AppState {
  loaded: boolean;
  orders: Order[];
  activity: ActivityEvent[];
  importQueue: ImportProgress[];
  failedImports: FailedImport[];
  duplicateImports: DuplicateImport[];
  selection: Set<string>;
  batchKeys: string[];
  combineMode: 'strict' | 'combine';
  theme: 'light' | 'dark';
  guides: { greyBars: boolean; cropMarks: boolean; cutLines: boolean; orderId: boolean; slotNumbers: boolean };
  /** per-product template overrides (edited in the Template screen); absent = factory template */
  templateOverrides: Record<string, TemplateDescriptor>;
  /** products created from an SVG on this machine (Add product) */
  customProducts: Product[];

  init(): Promise<void>;
  importFiles(files: File[]): Promise<void>;
  retryFailed(): Promise<void>;
  dismissFailed(): void;
  replaceDuplicates(fileNames: string[]): void;
  dismissDuplicates(): void;
  /** send a ready/printed/done order back through the review gate (approvals are kept) */
  reopenReview(key: string): void;
  setSelection(sel: Set<string>): void;
  updatePhoto(key: string, photoId: string, patch: Partial<Photo>): void;
  approveAll(key: string): void;
  swapPhotos(key: string, photoIdA: string, photoIdB: string): void;
  reframePhoto(key: string, photoId: string, placement: Placement | undefined): Promise<void>;
  setStatus(key: string, status: Order['status']): void;
  markPrinted(keys: string[], alsoDone: boolean): void;
  removeOrder(key: string): void;
  /** Print these orders with the given product's template. Orders that actually change
   *  template get their DPI recomputed and go back through review (approvals cleared).
   *  `remember` also ties each order's unknown ASIN to the product, which routes every other
   *  unassigned order with that ASIN, and all future ones, the same way. */
  assignProduct(keys: string[], productId: string, remember: boolean): void;
  buildBatch(keys: string[]): void;
  setCombineMode(m: 'strict' | 'combine'): void;
  toggleTheme(): void;
  setGuide(g: keyof AppState['guides'], v: boolean): void;
  setTemplateOverride(productId: string, t: TemplateDescriptor): void;
  resetTemplateOverride(productId: string): void;
  /** add or replace a custom product; returns an error message when it cannot be stored */
  saveProduct(p: Product): string | null;
  removeProduct(productId: string): void;
}

const TEMPLATE_LS_KEY = 'thiiroo-template-overrides';

let initStarted = false;

function loadTemplateOverrides(): Record<string, TemplateDescriptor> {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** the template a product actually prints with: override if present, else factory */
export function effectiveTemplate(s: Pick<AppState, 'templateOverrides'>, productId: string): TemplateDescriptor {
  return s.templateOverrides[productId] ?? getProduct(productId)!.template;
}

function recomputeStatus(o: Order): Order['status'] {
  if (o.status === 'printed' || o.status === 'done' || o.status === 'held') return o.status;
  return allApproved(o) && o.photos.some((p) => !p.missing) ? 'ready' : 'needs_review';
}

async function persistAndLog(o: Order, event: string) {
  await saveOrder(o);
  const ev: ActivityEvent = { at: Date.now(), orderId: o.id, event, photos: o.photos.length, status: o.status };
  await logActivity(ev);
  useStore.setState((s) => ({ activity: [ev, ...s.activity].slice(0, 30) }));
}

/** Point the chosen orders at `product`. An order whose template really changes is re-judged
 *  against the new photo frame: DPI recomputed, approvals cleared, back to needs_review (a held
 *  order stays held). One that already resolved to this product is left exactly as it is. */
function applyAssignment(chosen: Set<string>, product: Product, before: Map<string, string | undefined>) {
  const t = effectiveTemplate(useStore.getState(), product.id);
  useStore.setState((s) => ({
    orders: s.orders.map((o) => {
      const key = orderKey(o);
      if (!chosen.has(key) || before.get(key) === product.id) return o;
      // already printed: this is history, so only the routing changes
      const finished = o.status === 'printed' || o.status === 'done';
      const next: Order = {
        ...o,
        productId: product.id,
        photos: o.photos.map((p) => {
          if (p.missing) return p;
          const dpi = printDpi(p.crop, effectivePlacement(p).scale, photoFrame(t, p.crop));
          return { ...p, dpi, approved: finished ? p.approved : false, flagged: p.flagged || dpi < DPI_FLOOR };
        }),
        status: finished || o.status === 'held' ? o.status : 'needs_review',
      };
      void persistAndLog(next, `Template set to ${product.name}`);
      return next;
    }),
  }));
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  orders: [],
  activity: [],
  importQueue: [],
  failedImports: [],
  duplicateImports: [],
  selection: new Set(),
  batchKeys: [],
  combineMode: 'strict',
  theme: (localStorage.getItem('thiiroo-theme') as 'light' | 'dark') || 'light',
  guides: { greyBars: true, cropMarks: true, cutLines: true, orderId: true, slotNumbers: false },
  templateOverrides: loadTemplateOverrides(),
  customProducts: getCustomProducts(),

  async init() {
    // guard against concurrent calls (StrictMode double-mounts the effect); a second
    // load landing after early mutations would clobber the store with a stale snapshot
    if (get().loaded || initStarted) return;
    initStarted = true;
    const [orders, activity] = await Promise.all([loadOrders(), loadActivity()]);
    set({ orders, activity, loaded: true });
  },

  async importFiles(files) {
    const zips = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zips.length) return;
    set((s) => ({
      importQueue: [
        ...s.importQueue.filter((q) => q.state === 'queued' || q.state === 'decoding'),
        ...zips.map<ImportProgress>((f) => ({ fileName: f.name, state: 'queued' })),
      ],
    }));
    for (const file of zips) {
      const setProg = (patch: Partial<ImportProgress>) =>
        set((s) => ({
          importQueue: s.importQueue.map((q) => (q.fileName === file.name ? { ...q, ...patch } : q)),
        }));
      setProg({ state: 'decoding' });
      try {
        const order = await parseOrderZip(
          file,
          (done, total) => setProg({ photosDone: done, photosTotal: total, detail: `decoding ${done}/${total}` }),
          (asin, crop) => {
            const p = findByAsin(asin)?.product;
            return p ? photoFrame(effectiveTemplate(get(), p.id), crop) : undefined;
          }
        );
        // freeze the routing at import: a later registry change must not move an order
        // that is already reviewed onto another template
        order.productId = resolveProduct(order)?.id;
        const key = orderKey(order);
        const existing = get().orders.find((o) => orderKey(o) === key);
        if (existing) {
          // same order already in the queue — keep it (and its review work); offer replace in the UI
          set((s) => ({
            duplicateImports: [
              ...s.duplicateImports.filter((d) => orderKey(d.fresh) !== key),
              { fileName: file.name, fresh: order, existingStatus: existing.status },
            ],
          }));
          setProg({ state: 'skipped', detail: 'already imported' });
          continue;
        }
        set((s) => ({ orders: [...s.orders, order] }));
        setProg({
          state: 'done',
          detail: `${order.photos.length} · ${resolveProduct(order)?.name ?? 'needs a template'}`,
        });
        await persistAndLog(order, `Imported from ${file.name}`);
      } catch (err) {
        setProg({ state: 'error', detail: (err as Error).message });
        set((s) => ({
          failedImports: [
            ...s.failedImports.filter((f) => f.fileName !== file.name),
            { fileName: file.name, message: (err as Error).message, file },
          ],
        }));
      }
    }
  },

  async retryFailed() {
    const failed = get().failedImports;
    set({ failedImports: [] });
    await get().importFiles(failed.map((f) => f.file));
  },

  dismissFailed() {
    set({ failedImports: [] });
  },

  replaceDuplicates(fileNames) {
    const toApply = get().duplicateImports.filter((d) => fileNames.includes(d.fileName));
    // a replaced order keeps the template it was routed or hand-assigned to
    for (const d of toApply) {
      const existing = get().orders.find((o) => orderKey(o) === orderKey(d.fresh));
      const product = existing && resolveProduct(existing);
      if (!product) continue;
      const t = effectiveTemplate(get(), product.id);
      d.fresh.productId = product.id;
      d.fresh.photos = d.fresh.photos.map((p) => {
        if (p.missing) return p;
        const dpi = printDpi(p.crop, p.buyerPlacement.scale, photoFrame(t, p.crop));
        return { ...p, dpi, flagged: dpi < DPI_FLOOR };
      });
    }
    set((s) => ({
      orders: s.orders.map((o) => toApply.find((d) => orderKey(d.fresh) === orderKey(o))?.fresh ?? o),
      duplicateImports: s.duplicateImports.filter((d) => !fileNames.includes(d.fileName)),
    }));
    for (const d of toApply) void persistAndLog(d.fresh, `Replaced by re-import of ${d.fileName}`);
  },

  dismissDuplicates() {
    set({ duplicateImports: [] });
  },

  reopenReview(key) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (orderKey(o) !== key || o.status === 'needs_review') return o;
        const next = { ...o, status: 'needs_review' as const };
        void persistAndLog(next, 'Review reopened');
        return next;
      }),
    }));
  },

  setSelection(sel) {
    set({ selection: new Set(sel) });
  },

  updatePhoto(key, photoId, patch) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (orderKey(o) !== key) return o;
        const next = {
          ...o,
          photos: o.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
        };
        next.status = recomputeStatus(next);
        void saveOrder(next);
        return next;
      }),
    }));
  },

  approveAll(key) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (orderKey(o) !== key) return o;
        const next = { ...o, photos: o.photos.map((p) => (p.missing ? p : { ...p, approved: true })) };
        next.status = recomputeStatus(next);
        void persistAndLog(next, 'All crops approved');
        return next;
      }),
    }));
  },

  swapPhotos(key, photoIdA, photoIdB) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (orderKey(o) !== key) return o;
        const ia = o.photos.findIndex((p) => p.id === photoIdA);
        const ib = o.photos.findIndex((p) => p.id === photoIdB);
        if (ia < 0 || ib < 0 || ia === ib) return o;
        const photos = [...o.photos];
        [photos[ia], photos[ib]] = [photos[ib], photos[ia]];
        const next = { ...o, photos };
        void saveOrder(next);
        return next;
      }),
    }));
  },

  async reframePhoto(key, photoId, placement) {
    const order = get().orders.find((o) => orderKey(o) === key);
    const photo = order?.photos.find((p) => p.id === photoId);
    if (!order || !photo || photo.missing) return;
    const eff = placement ?? photo.buyerPlacement;
    const res = await cropPhoto(photo.sourceBlob, photo.crop, eff);
    get().updatePhoto(key, photoId, {
      override: placement,
      cropBlob: res.blob,
      cropW: res.w,
      cropH: res.h,
      dpi: printDpi(photo.crop, eff.scale, photoFrame(orderTemplate(order), photo.crop)),
      approved: false,
    });
  },

  setStatus(key, status) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (orderKey(o) !== key) return o;
        const next = { ...o, status };
        void persistAndLog(
          next,
          status === 'held' ? 'Order held' : status === 'done' ? 'Marked cut & laminated' : `Status → ${status}`
        );
        return next;
      }),
    }));
  },

  markPrinted(keys, alsoDone) {
    const now = Date.now();
    set((s) => ({
      orders: s.orders.map((o) => {
        if (!keys.includes(orderKey(o))) return o;
        const next = { ...o, status: alsoDone ? ('done' as const) : ('printed' as const), printedAt: now };
        void persistAndLog(next, alsoDone ? 'Printed, cut & laminated' : `Sheets sent to printer`);
        return next;
      }),
      selection: new Set(),
    }));
  },

  removeOrder(key) {
    const order = get().orders.find((o) => orderKey(o) === key);
    if (order) {
      void deleteOrder(order);
      // removal drops the order's activity history too (note: matches by orderId, so a
      // multi-item order loses the history of all its items)
      void deleteActivityFor(order.id);
    }
    set((s) => ({
      orders: s.orders.filter((o) => orderKey(o) !== key),
      activity: order ? s.activity.filter((ev) => ev.orderId !== order.id) : s.activity,
      selection: new Set([...s.selection].filter((sel) => sel !== key)),
    }));
  },

  assignProduct(keys, productId, remember) {
    const product = getProduct(productId);
    if (!product) return;
    const chosen = new Set(keys);
    // "did the template change" is judged against the registry as it was before learning
    const before = new Map(get().orders.map((o) => [orderKey(o), resolveProduct(o)?.id]));
    if (remember) {
      const learned = { ...getLearnedAsins() };
      const asins = new Set<string>();
      for (const o of get().orders) {
        if (!chosen.has(orderKey(o)) || !o.asin || findByAsin(o.asin)) continue;
        learned[o.asin] = { productId, packSize: o.photos.length };
        asins.add(o.asin);
      }
      // siblings: other unassigned orders with a just-remembered ASIN follow it
      for (const o of get().orders) {
        if (asins.has(o.asin) && !before.get(orderKey(o))) chosen.add(orderKey(o));
      }
      try {
        saveLearnedAsins(learned);
      } catch {
        // browser storage is full: the ASIN is not remembered, but these orders are still assigned
      }
    }
    applyAssignment(chosen, product, before);
  },

  buildBatch(keys) {
    set({ batchKeys: keys });
  },

  setCombineMode(m) {
    set({ combineMode: m });
  },

  toggleTheme() {
    const t = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('thiiroo-theme', t);
    set({ theme: t });
  },

  setGuide(g, v) {
    set((s) => ({ guides: { ...s.guides, [g]: v } }));
  },

  setTemplateOverride(productId, t) {
    set((s) => {
      const templateOverrides = { ...s.templateOverrides, [productId]: t };
      localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(templateOverrides));
      return { templateOverrides };
    });
  },

  resetTemplateOverride(productId) {
    set((s) => {
      const templateOverrides = { ...s.templateOverrides };
      delete templateOverrides[productId];
      localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(templateOverrides));
      return { templateOverrides };
    });
  },

  saveProduct(p) {
    const next = [...get().customProducts.filter((x) => x.id !== p.id), p];
    try {
      saveCustomProducts(next);
    } catch {
      return 'Not enough browser storage to save this product. Save it without the SVG artwork.';
    }
    set({ customProducts: next });
    return null;
  },

  removeProduct(productId) {
    const next = get().customProducts.filter((x) => x.id !== productId);
    // orders of the deleted product become unassigned (or fall back to their ASIN's product);
    // either way what they were approved against is gone, so unprinted ones are reviewed again
    const affected = new Set(
      get().orders.filter((o) => resolveProduct(o)?.id === productId).map(orderKey)
    );
    saveCustomProducts(next);
    saveLearnedAsins(
      Object.fromEntries(Object.entries(getLearnedAsins()).filter(([, l]) => l.productId !== productId))
    );
    set((s) => ({
      customProducts: next,
      orders: s.orders.map((o) => {
        if (!affected.has(orderKey(o))) return o;
        const finished = o.status === 'printed' || o.status === 'done';
        const cleared: Order = {
          ...o,
          productId: undefined,
          photos: finished ? o.photos : o.photos.map((p) => (p.missing ? p : { ...p, approved: false })),
          status: finished || o.status === 'held' ? o.status : 'needs_review',
        };
        void saveOrder(cleared);
        return cleared;
      }),
    }));
    get().resetTemplateOverride(productId);
  },
}));
