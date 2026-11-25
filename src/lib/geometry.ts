/** Physical template geometry in mm, extracted from the seller's Illustrator print file (A4 landscape). */

export const SHEET = { w: 297, h: 210 };
export const CARD = { w: 76.2, h: 101.6 }; // exactly 3in x 4in
export const COL_X = [22.0, 110.5, 198.8]; // card left edges
export const ROW_TOP = [3.4, 105.0]; // card top edges (CSS top-down; rows touch at the cut line)
export const PHOTO = { w: 69.8, h: 82.5 };
export const PHOTO_INSET = 3.2; // left/right/top inset inside the card
export const CHIN = 15.9; // white strip at the bottom of the card

/** grey cut-waste bars (printed) */
export const V_BARS = [
  { x: 16.6, w: 5.4 },
  { x: 96.05, w: 16.6 },
  { x: 184.45, w: 16.6 },
  { x: 275.0, w: 5.4 },
];
export const H_STRIPS = [
  { x: 16.6, w: 263.8, y: 0, h: 6.8 },
  { x: 16.6, w: 263.8, y: 203.2, h: 6.8 },
];
export const ID_ZONE = { x: 281.5, y: 80, w: 10, h: 104 }; // rotated order-id text zone (centred ~27mm below sheet middle)

export const SLOTS_PER_SHEET = 6;

/** A complete sheet layout, all values in mm. Phase 2: products carry one of these. */
export interface TemplateDescriptor {
  sheet: { w: number; h: number };
  card: { w: number; h: number };
  colX: number[];
  rowTop: number[];
  photo: { w: number; h: number };
  photoInset: number;
  chin: number;
  vBars: { x: number; w: number }[];
  hStrips: { x: number; w: number; y: number; h: number }[];
  idZone: { x: number; y: number; w: number; h: number };
  /** Free-form layout built from an imported SVG (Add product). When present it replaces
   *  the card grid: the grid fields above are kept only as informational defaults. */
  custom?: CustomLayout;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CustomLayout {
  /** photo frames in fill order, sheet coordinates in mm */
  photos: Rect[];
  /** cut outlines (cards, strips) in mm — drive the outline and crop marks */
  cuts: Rect[];
  /** the source SVG as a data URL, drawn full-sheet underneath the photos */
  artwork?: string;
  /** whether the artwork is printed, or only the photos */
  printArtwork: boolean;
}

/** Recompute the grey cut-waste bars from card geometry. The constants reproduce
 *  the Illustrator file's bars exactly for the default template (verified below). */
export function deriveWaste(t: Pick<TemplateDescriptor, 'sheet' | 'card' | 'colX' | 'rowTop'>) {
  const OUTER = 5.4; // width of the bars outside the first/last card
  const MID_W = 16.6; // fixed width of a mid bar, centered on the gap between cards
  const OV_V = 3.4; // vertical tuck of the top/bottom strips under the cards
  const cols = [...t.colX].sort((a, b) => a - b);
  const lastRight = cols[cols.length - 1] + t.card.w;
  const vBars = [
    { x: cols[0] - OUTER, w: OUTER },
    ...cols.slice(1).map((left, i) => {
      const gapCenter = (cols[i] + t.card.w + left) / 2;
      return { x: gapCenter - MID_W / 2, w: MID_W };
    }),
    { x: lastRight, w: OUTER },
  ];
  const x = cols[0] - OUTER;
  const w = lastRight + OUTER - x;
  const rows = [...t.rowTop].sort((a, b) => a - b);
  const hStrips = [
    { x, w, y: 0, h: rows[0] + OV_V },
    { x, w, y: rows[rows.length - 1] + t.card.h - OV_V, h: t.sheet.h - (rows[rows.length - 1] + t.card.h - OV_V) },
  ];
  return { vBars, hStrips };
}

/** The verified Instant Photo Prints layout (matches the seller's Illustrator template). */
export const DEFAULT_TEMPLATE: TemplateDescriptor = {
  sheet: SHEET,
  card: CARD,
  colX: COL_X,
  rowTop: ROW_TOP,
  photo: PHOTO,
  photoInset: PHOTO_INSET,
  chin: CHIN,
  vBars: V_BARS,
  hStrips: H_STRIPS,
  idZone: ID_ZONE,
};

export function slotsPerSheet(t: TemplateDescriptor): number {
  return t.custom ? t.custom.photos.length : t.colX.length * t.rowTop.length;
}

/** slot order: top row L->R then bottom row L->R */
export function slotRect(slot: number, t: TemplateDescriptor = DEFAULT_TEMPLATE) {
  const col = slot % t.colX.length;
  const row = Math.floor(slot / t.colX.length);
  return { x: t.colX[col], y: t.rowTop[row], w: t.card.w, h: t.card.h };
}

/** DPI floor used for warnings */
export const DPI_FLOOR = 150;

/** effective print DPI for a crop that spans `cropUnits` design units mapped from source pixels at `scale` */
export function printDpi(cropWidthUnits: number, scale: number): number {
  const sourcePx = cropWidthUnits / scale;
  const inches = PHOTO.w / 25.4;
  return Math.round(sourcePx / inches);
}
