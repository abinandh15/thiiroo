export type OrderStatus =
  | 'importing'
  | 'needs_review'
  | 'ready'
  | 'printed'
  | 'done'
  | 'held'
  | 'error';

export interface Placement {
  /** top-left of the scaled image on the 400x400 design canvas */
  position: { x: number; y: number };
  /** original (EXIF-oriented) image pixel size */
  dimension: { width: number; height: number };
  scale: number;
  angle: number;
}

export interface Photo {
  id: string;
  slotIndex: number;
  label: string;
  imageName: string;
  buyerFilename: string;
  sourceW: number;
  sourceH: number;
  /** crop window on the design canvas, e.g. 219x260 @ (90,50) */
  crop: { x: number; y: number; w: number; h: number };
  buyerPlacement: Placement;
  /** manual re-frame; when set it wins over buyerPlacement */
  override?: Placement;
  /** original bytes from the zip — kept so re-framing can re-crop */
  sourceBlob: Blob;
  cropBlob: Blob;
  cropW: number;
  cropH: number;
  dpi: number;
  missing: boolean;
  approved: boolean;
  flagged: boolean;
}

export interface Order {
  id: string; // orderId
  itemId: string;
  asin: string;
  /** template chosen by hand; wins over the ASIN lookup. Absent = follow the ASIN. */
  productId?: string;
  title: string;
  qty: number;
  zipName: string;
  importedAt: number;
  status: OrderStatus;
  photos: Photo[];
  snapshotBlob?: Blob;
  warnings: string[];
  errorMessage?: string;
  printedAt?: number;
}

export interface ImportProgress {
  fileName: string;
  state: 'queued' | 'decoding' | 'done' | 'skipped' | 'error';
  detail?: string;
  photosDone?: number;
  photosTotal?: number;
}

export interface ActivityEvent {
  at: number;
  orderId: string;
  event: string;
  photos: number;
  status: OrderStatus;
}
