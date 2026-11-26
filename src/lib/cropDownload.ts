import type { Order, Photo } from './types';
import type { TemplateDescriptor } from './geometry';
import { buildStoredZip } from './zip';

/** "Image 1" + "IMG_0042.jpeg" -> "Image 1_IMG_0042.jpg" (same naming as the Crop export tool) */
export function cropFileName(p: Photo): string {
  const base = (p.buyerFilename || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '_');
  return `${p.label.replace(/[^\w\- ]+/g, '-')}_${base}.jpg`;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** The printed frame (mm) the photo at position `index` of an order lands in. The sheet fills
 *  slots in order (Sheet.tsx: custom.photos[slot]), wrapping to the next sheet. */
export function frameForIndex(t: TemplateDescriptor, index: number): { w: number; h: number } {
  if (!t.custom) return t.photo;
  const frames = t.custom.photos;
  return frames.length ? frames[index % frames.length] : t.photo;
}

/** The centred region of a w×h image that a frame of the given shape shows when the image fills
 *  it (CSS object-fit: cover, which is how the sheet places every photo). Aspect differences
 *  under 0.5% are left alone so a matching crop is never re-encoded. Returns null = no trim. */
export function coverRect(
  w: number,
  h: number,
  frame: { w: number; h: number }
): { x: number; y: number; w: number; h: number } | null {
  if (!(w > 0 && h > 0 && frame.w > 0 && frame.h > 0)) return null;
  const target = frame.w / frame.h;
  const have = w / h;
  if (Math.abs(have - target) / target < 0.005) return null;
  if (have > target) {
    const nw = Math.round(h * target);
    return { x: Math.round((w - nw) / 2), y: 0, w: nw, h };
  }
  const nh = Math.round(w / target);
  return { x: 0, y: Math.round((h - nh) / 2), w, h: nh };
}

/** A photo's crop trimmed to what its frame actually prints. Same pixels, no resampling: only
 *  the edges the sheet would hide are cut off, then re-encoded as JPEG q0.95. */
export async function trimToFrame(blob: Blob, frame: { w: number; h: number }): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try {
    const r = coverRect(bmp.width, bmp.height, frame);
    if (!r) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = r.w;
    canvas.height = r.h;
    canvas.getContext('2d')!.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode crop'))), 'image/jpeg', 0.95)
    );
  } finally {
    bmp.close();
  }
}

/** One photo's crop as it currently stands (buyer framing, or your re-frame from Review),
 *  trimmed to its frame when a template is given. `index` = its position in the order. */
export async function downloadPhotoCrop(p: Photo, index = 0, template?: TemplateDescriptor) {
  if (p.missing) return;
  const blob = template ? await trimToFrame(p.cropBlob, frameForIndex(template, index)) : p.cropBlob;
  downloadBlob(blob, cropFileName(p));
}

/** Every non-missing crop of the given orders as one zip, trimmed to the template's frames when
 *  a template is given. A single order gives a flat zip named after it; several orders give one
 *  folder per order. Returns how many photos were written. */
export async function downloadOrderCrops(orders: Order[], template?: TemplateDescriptor): Promise<number> {
  const many = orders.length > 1;
  const files: { name: string; data: Uint8Array }[] = [];
  for (const o of orders) {
    const folder = many ? `${o.id}_${o.itemId}/` : '';
    for (const [i, p] of o.photos.entries()) {
      if (p.missing) continue;
      const blob = template ? await trimToFrame(p.cropBlob, frameForIndex(template, i)) : p.cropBlob;
      files.push({ name: folder + cropFileName(p), data: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  if (!files.length) return 0;
  const name = many ? `crops-${orders.length}-orders.zip` : `${orders[0].itemId || orders[0].id}-crops.zip`;
  downloadBlob(buildStoredZip(files), name);
  return files.length;
}
