import { readZip } from './zip';
import { printDpi } from './geometry';
import type { Order, Photo, Placement } from './types';
import { packWarning } from '../products';

export const CROP_OUT_W = 1095;
export const CROP_OUT_H = 1300;

interface RawSlot {
  label: string;
  imageName: string;
  buyerFilename: string;
  crop: { x: number; y: number; w: number; h: number };
  placement: Placement;
}

function collectPlacements(node: unknown, out: RawSlot[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'PlacementContainerCustomization' && n.buyerPlacement) {
    const children = (n.children as Record<string, unknown>[]) || [];
    const imgChild = children.find(
      (c) => c.type === 'ImageCustomization' && (c.image as Record<string, unknown>)?.imageName
    );
    if (imgChild) {
      const image = imgChild.image as { imageName: string; buyerFilename?: string };
      const bp = n.buyerPlacement as {
        position: { x: number; y: number };
        dimension: { width: number; height: number };
        scale: { scaleX: number };
        angleOfRotation?: number;
      };
      const pos = (n.position as { x: number; y: number }) ?? { x: 0, y: 0 };
      const dim = (n.dimension as { width: number; height: number }) ?? { width: 0, height: 0 };
      out.push({
        label: (n.label as string) || (n.name as string) || `Image ${out.length + 1}`,
        imageName: image.imageName,
        buyerFilename: image.buyerFilename || image.imageName,
        crop: { x: pos.x, y: pos.y, w: dim.width, h: dim.height },
        placement: {
          position: bp.position,
          dimension: bp.dimension,
          scale: bp.scale?.scaleX ?? 1,
          angle: bp.angleOfRotation ?? 0,
        },
      });
    }
  }
  for (const child of ((n.children as unknown[]) || [])) collectPlacements(child, out);
}

/**
 * Crop one photo. Placement numbers are in EXIF-oriented space, so orientation
 * is applied at decode. Output is always CROP_OUT_W x (aspect-matched height).
 */
export async function cropPhoto(
  sourceBlob: Blob,
  crop: { x: number; y: number; w: number; h: number },
  p: Placement
): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
  const outW = CROP_OUT_W;
  const outH = Math.round((crop.h * CROP_OUT_W) / crop.w);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  const k = outW / crop.w; // output px per design-canvas unit
  ctx.setTransform(k, 0, 0, k, -crop.x * k, -crop.y * k);
  const cx = p.position.x + (p.dimension.width * p.scale) / 2;
  const cy = p.position.y + (p.dimension.height * p.scale) / 2;
  ctx.translate(cx, cy);
  if (p.angle) ctx.rotate((p.angle * Math.PI) / 180);
  ctx.scale(p.scale, p.scale);
  ctx.drawImage(bmp, -p.dimension.width / 2, -p.dimension.height / 2);
  bmp.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))), 'image/jpeg', 0.95)
  );
  return { blob, w: outW, h: outH };
}

/** Parse an Amazon customization zip into a fully cropped Order.
 *  `frameOf` gives the printed photo frame (mm) of the product an ASIN routes to, so DPI is
 *  judged against the right template; without it (or for an unknown ASIN) the Instant Photo
 *  Prints photo area is assumed, and the DPI is recomputed when a template is assigned. */
export async function parseOrderZip(
  file: File,
  onPhotoDone: (done: number, total: number) => void,
  frameOf?: (asin: string, crop: { w: number; h: number }) => { w: number; h: number } | undefined
): Promise<Order> {
  const zip = await readZip(await file.arrayBuffer());
  const jsonName = zip.names.find((n) => n.toLowerCase().endsWith('.json'));
  if (!jsonName) {
    throw new Error('No customization JSON found — is this a shipping-label zip?');
  }
  const jsonBytes = (await zip.extract(jsonName))!;
  const meta = JSON.parse(new TextDecoder().decode(jsonBytes.slice().buffer)) as Record<string, unknown>;

  const slots: RawSlot[] = [];
  collectPlacements(meta.customizationData, slots);
  if (!slots.length) throw new Error('No image placements found in the order JSON — unexpected format.');

  const orderId = (meta.orderId as string) || file.name.replace(/\.zip$/i, '');
  const itemId = (meta.orderItemId as string) || '';
  const asin = (meta.asin as string) || '';

  let snapshotBlob: Blob | undefined;
  const custData = meta.customizationData as { children?: { snapshot?: { imageName?: string } }[] } | undefined;
  const snapName = custData?.children?.[0]?.snapshot?.imageName;
  if (snapName && zip.names.includes(snapName)) {
    const b = await zip.extract(snapName);
    if (b) snapshotBlob = new Blob([b.slice().buffer], { type: 'image/jpeg' });
  }

  const photos: Photo[] = [];
  const warnings: string[] = [];
  let lowDpiCount = 0;
  let missingCount = 0;

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const inZip = zip.names.includes(s.imageName);
    const dpi = printDpi(s.crop, s.placement.scale, frameOf?.(asin, s.crop));
    let sourceBlob = new Blob([]);
    let cropBlob = new Blob([]);
    let cropW = CROP_OUT_W;
    let cropH = CROP_OUT_H;
    if (inZip) {
      const bytes = (await zip.extract(s.imageName))!;
      sourceBlob = new Blob([bytes.slice().buffer], { type: 'image/jpeg' });
      const res = await cropPhoto(sourceBlob, s.crop, s.placement);
      cropBlob = res.blob;
      cropW = res.w;
      cropH = res.h;
    } else {
      missingCount++;
    }
    if (inZip && dpi < 150) lowDpiCount++;
    photos.push({
      id: `${itemId || orderId}-${i}`,
      slotIndex: i,
      label: s.label,
      imageName: s.imageName,
      buyerFilename: s.buyerFilename,
      sourceW: s.placement.dimension.width,
      sourceH: s.placement.dimension.height,
      crop: s.crop,
      buyerPlacement: s.placement,
      sourceBlob,
      cropBlob,
      cropW,
      cropH,
      dpi,
      missing: !inZip,
      approved: false,
      flagged: !inZip || dpi < 150,
    });
    onPhotoDone(i + 1, slots.length);
  }

  if (lowDpiCount) warnings.push(`${lowDpiCount} photo${lowDpiCount > 1 ? 's' : ''} below 150 DPI`);
  if (missingCount)
    warnings.push(`${missingCount} image${missingCount > 1 ? 's' : ''} referenced but missing from zip`);

  const packWarn = packWarning({ asin, photos });
  if (packWarn) warnings.push(packWarn);

  return {
    id: orderId,
    itemId,
    asin,
    title: (meta.title as string) || '',
    qty: (meta.quantity as number) ?? 1,
    zipName: file.name,
    importedAt: Date.now(),
    status: 'needs_review',
    photos,
    snapshotBlob,
    warnings,
  };
}
