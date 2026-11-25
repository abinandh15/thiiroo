import { create } from 'zustand';
import type { ActivityEvent, ImportProgress, Order, Photo, Placement } from './lib/types';
import { cropPhoto, parseOrderZip } from './lib/ingest';
import { printDpi, SLOTS_PER_SHEET } from './lib/geometry';
import type { TemplateDescriptor } from './lib/geometry';
import { getCustomProducts, getProduct, saveCustomProducts } from './products';
import type { Product } from './products';
import { deleteOrder, loadActivity, loadOrders, logActivity, saveOrder } from './lib/persist';

export const orderKey = (o: Pick<Order, 'id' | 'itemId'>) => `${o.id}::${o.itemId}`;

export function sheetsPerCopy(o: Order): number {
  return Math.max(1, Math.ceil(o.photos.length / SLOTS_PER_SHEET));
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

interface AppState {
  loaded: boolean;
  orders: Order[];
  activity: ActivityEvent[];
  importQueue: ImportProgress[];
  failedImports: FailedImport[];
  selection: Set<string>;
  batchKeys: string[];
  combineMode: 'strict' | 'combine';
  theme: 'light' | 'dark';
  guides: { greyBars: boolean; cropMarks: boolean; orderId: boolean; slotNumbers: boolean };
  /** per-product template overrides (edited in the Template screen); absent = factory template */
  templateOverrides: Record<string, TemplateDescriptor>;
  /** products created from an SVG on this machine (Add product) */
  customProducts: Product[];

  init(): Promise<void>;
  importFiles(files: File[]): Promise<void>;
  retryFailed(): Promise<void>;
  dismissFailed(): void;
  setSelection(sel: Set<string>): void;
  updatePhoto(key: string, photoId: string, patch: Partial<Photo>): void;
  approveAll(key: string): void;
  swapPhotos(key: string, photoIdA: string, photoIdB: string): void;
  reframePhoto(key: string, photoId: string, placement: Placement | undefined): Promise<void>;
  setStatus(key: string, status: Order['status']): void;
  markPrinted(keys: string[], alsoDone: boolean): void;
  removeOrder(key: string): void;
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

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  orders: [],
  activity: [],
  importQueue: [],
  failedImports: [],
  selection: new Set(),
  batchKeys: [],
  combineMode: 'strict',
  theme: (localStorage.getItem('thiiroo-theme') as 'light' | 'dark') || 'light',
  guides: { greyBars: true, cropMarks: true, orderId: true, slotNumbers: false },
  templateOverrides: loadTemplateOverrides(),
  customProducts: getCustomProducts(),

  async init() {
    if (get().loaded) return;
    const [orders, activity] = await Promise.all([loadOrders(), loadActivity()]);
    set({ orders, activity, loaded: true });
  },

  async importFiles(files) {
    const zips = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zips.length) return;
    set((s) => ({
      importQueue: [
        ...s.importQueue.filter((q) => q.state !== 'done' && q.state !== 'error'),
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
        const order = await parseOrderZip(file, (done, total) =>
          setProg({ photosDone: done, photosTotal: total, detail: `decoding ${done}/${total}` })
        );
        const key = orderKey(order);
        set((s) => ({
          orders: [...s.orders.filter((o) => orderKey(o) !== key), order],
        }));
        setProg({ state: 'done', detail: `${order.photos.length}` });
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
      dpi: printDpi(photo.crop.w, eff.scale),
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
    if (order) void deleteOrder(order);
    set((s) => ({ orders: s.orders.filter((o) => orderKey(o) !== key) }));
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
    saveCustomProducts(next);
    set({ customProducts: next });
    get().resetTemplateOverride(productId);
  },
}));
