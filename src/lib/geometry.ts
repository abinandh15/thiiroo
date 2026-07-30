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
export const ID_ZONE = { x: 281.5, y: 53, w: 10, h: 104 }; // rotated order-id text zone

export const SLOTS_PER_SHEET = 6;

/** slot order: top row L->R then bottom row L->R */
export function slotRect(slot: number) {
  const col = slot % 3;
  const row = Math.floor(slot / 3);
  return { x: COL_X[col], y: ROW_TOP[row], w: CARD.w, h: CARD.h };
}

/** DPI floor used for warnings */
export const DPI_FLOOR = 150;

/** effective print DPI for a crop that spans `cropUnits` design units mapped from source pixels at `scale` */
export function printDpi(cropWidthUnits: number, scale: number): number {
  const sourcePx = cropWidthUnits / scale;
  const inches = PHOTO.w / 25.4;
  return Math.round(sourcePx / inches);
}
