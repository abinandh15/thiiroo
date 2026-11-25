import type { CustomLayout, Rect, TemplateDescriptor } from './geometry';

/** Converts a print-template SVG (Illustrator / Inkscape / Figma export) into a sheet layout.
 *  Every sizeable shape is measured in mm and given a role; the Add product screen lets the
 *  seller correct the roles before saving. */

export type ShapeRole = 'photo' | 'cut' | 'ignore';

export interface DetectedShape {
  id: number;
  rect: Rect;
  tag: string;
  /** element id / Illustrator layer name, when the file carries one */
  name: string;
  /** name of the enclosing group / layer */
  groupName: string;
  role: ShapeRole;
}

export interface ParsedSvg {
  sheet: { w: number; h: number };
  /** how the physical size was worked out, shown to the user */
  sizeSource: string;
  /** true when the file gave no physical unit and the size is a best guess */
  sizeGuessed: boolean;
  shapes: DetectedShape[];
  /** sanitized SVG as a data URL */
  artwork: string;
  artworkBytes: number;
}

const MM_PER: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
};

/** common sheet sizes in mm, used to tell 72-dpi files from 96-dpi ones */
const PAPER: [string, number, number][] = [
  ['A5', 148, 210],
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['Letter', 215.9, 279.4],
  ['4×6 in', 101.6, 152.4],
  ['12×18 in', 304.8, 457.2],
  ['13×19 in', 330.2, 482.6],
];

const MIN_SIDE_MM = 5; // smaller shapes are marks, text or decoration
const TOL = 0.3; // mm tolerance for "same rectangle" / "inside"

const r2 = (v: number) => Math.round(v * 100) / 100;

function paperMatch(w: number, h: number): string | undefined {
  const [a, b] = w < h ? [w, h] : [h, w];
  const hit = PAPER.find(([, pw, ph]) => Math.abs(pw - a) < 1 && Math.abs(ph - b) < 1);
  return hit ? `${hit[0]} ${w < h ? 'portrait' : 'landscape'}` : undefined;
}

function parseLength(v: string | null): { n: number; unit: string } | undefined {
  if (!v) return undefined;
  const m = /^\s*([0-9.eE+-]+)\s*([a-z%]*)\s*$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || m[2] === '%') return undefined;
  return { n, unit: m[2] || 'px' };
}

export const sameSize = (a: Rect, b: Rect) => Math.abs(a.w - b.w) < TOL && Math.abs(a.h - b.h) < TOL;

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - TOL &&
  inner.y >= outer.y - TOL &&
  inner.x + inner.w <= outer.x + outer.w + TOL &&
  inner.y + inner.h <= outer.y + outer.h + TOL &&
  (outer.w - inner.w > TOL || outer.h - inner.h > TOL);

/** rows top-to-bottom, left-to-right within a row */
function readingOrder<T extends { rect: Rect }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.rect.y - b.rect.y);
  const rows: T[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && it.rect.y < row[0].rect.y + row[0].rect.h / 2) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.rect.x - b.rect.x));
}

function guessRoles(shapes: DetectedShape[]): void {
  const hint = (name: string): ShapeRole | undefined => {
    const n = name.toLowerCase();
    if (/photo|image|picture|slot|frame|placeholder/.test(n)) return 'photo';
    if (/cut|card|strip|die|trim|outline/.test(n)) return 'cut';
    if (/guide|bleed|waste|bar|mark|background|\bbg\b/.test(n)) return 'ignore';
    return undefined;
  };
  const anyNesting = shapes.some((a) => shapes.some((b) => contains(a.rect, b.rect)));
  for (const s of shapes) {
    // the shape's own name always wins
    const h = hint(s.name);
    if (h) {
      s.role = h;
      continue;
    }
    if (s.tag === 'image') {
      s.role = 'photo';
      continue;
    }
    const holdsOthers = shapes.some((b) => contains(s.rect, b.rect));
    const insideOther = shapes.some((b) => contains(b.rect, s.rect));
    if (holdsOthers) s.role = insideOther ? 'ignore' : 'cut';
    else if (insideOther) s.role = 'photo';
    // geometry is silent: fall back to the layer name (a "strip" group also holds its frames,
    // so layer names are only trusted here)
    else s.role = hint(s.groupName) ?? (anyNesting ? 'ignore' : 'photo');
  }
}

const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const NUM_RE_ONCE = /^[\s,]*[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;

/** split path data at each moveto; `rest` is everything after the M/m letter */
function splitSubpaths(d: string): { relative: boolean; rest: string }[] {
  return (d.match(/[Mm][^Mm]*/g) ?? []).map((seg) => ({ relative: seg[0] === 'm', rest: seg.slice(1) }));
}

/** Parse and measure an SVG. Must run in the browser: shapes are measured by the SVG engine,
 *  so transforms, groups and paths are all handled. Throws with a readable message. */
export function parseSvgTemplate(text: string): ParsedSvg {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('This file is not a readable SVG.');
  }

  // never mount or store active content
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  });

  const wAttr = parseLength(root.getAttribute('width'));
  const hAttr = parseLength(root.getAttribute('height'));
  const vbParts = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const hasVb = vbParts.length === 4 && vbParts.every(Number.isFinite) && vbParts[2] > 0 && vbParts[3] > 0;
  const vb = hasVb
    ? { x: vbParts[0], y: vbParts[1], w: vbParts[2], h: vbParts[3] }
    : wAttr && hAttr
      ? { x: 0, y: 0, w: wAttr.n, h: hAttr.n }
      : undefined;
  if (!vb) throw new Error('The SVG has no viewBox or width/height, so its size cannot be worked out.');

  // physical width of the sheet
  let sheetW: number;
  let sizeSource: string;
  let sizeGuessed = false;
  if (wAttr && MM_PER[wAttr.unit]) {
    sheetW = wAttr.n * MM_PER[wAttr.unit];
    sizeSource = `width="${wAttr.n}${wAttr.unit}" in the file`;
  } else {
    const px = wAttr?.n ?? vb.w;
    const pxH = hAttr?.n ?? vb.h;
    const at72 = paperMatch((px * 25.4) / 72, (pxH * 25.4) / 72);
    const at96 = paperMatch((px * 25.4) / 96, (pxH * 25.4) / 96);
    if (at72) {
      sheetW = (px * 25.4) / 72;
      sizeSource = `${at72} at 72 units/inch (Illustrator)`;
    } else if (at96) {
      sheetW = (px * 25.4) / 96;
      sizeSource = `${at96} at 96 px/inch`;
    } else {
      sheetW = (px * 25.4) / 72;
      sizeSource = 'no unit in the file — assumed 72 units/inch';
      sizeGuessed = true;
    }
  }
  const k = sheetW / vb.w; // mm per user unit
  const sheet = { w: r2(sheetW), h: r2(vb.h * k) };

  // mount off-screen at 1 CSS px per user unit so the engine can measure every shape
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  const live = document.importNode(root, true) as unknown as SVGSVGElement;
  live.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  live.setAttribute('width', String(vb.w));
  live.setAttribute('height', String(vb.h));
  live.removeAttribute('style');
  live.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  host.appendChild(live);
  document.body.appendChild(host);

  const shapes: DetectedShape[] = [];
  try {
    const origin = live.getBoundingClientRect();
    const els = live.querySelectorAll<SVGGraphicsElement>('rect, path, polygon, polyline, circle, ellipse, image, use');
    const add = (target: SVGGraphicsElement, src: Element, named: boolean) => {
      let box: DOMRect;
      let m: DOMMatrix | null;
      try {
        box = target.getBBox();
        m = target.getScreenCTM();
      } catch {
        return;
      }
      if (!m || box.width <= 0 || box.height <= 0) return;
      const corners = [
        new DOMPoint(box.x, box.y),
        new DOMPoint(box.x + box.width, box.y),
        new DOMPoint(box.x, box.y + box.height),
        new DOMPoint(box.x + box.width, box.y + box.height),
      ].map((p) => p.matrixTransform(m!));
      const xs = corners.map((p) => p.x - origin.left);
      const ys = corners.map((p) => p.y - origin.top);
      const rect: Rect = {
        x: r2(Math.min(...xs) * k),
        y: r2(Math.min(...ys) * k),
        w: r2((Math.max(...xs) - Math.min(...xs)) * k),
        h: r2((Math.max(...ys) - Math.min(...ys)) * k),
      };
      if (rect.w < MIN_SIDE_MM || rect.h < MIN_SIDE_MM) return;
      if (rect.w >= sheet.w * 0.97 && rect.h >= sheet.h * 0.97) return; // page background
      if (rect.x < -TOL || rect.y < -TOL || rect.x + rect.w > sheet.w + TOL || rect.y + rect.h > sheet.h + TOL) return;
      if (shapes.some((s) => Math.abs(s.rect.x - rect.x) < TOL && Math.abs(s.rect.y - rect.y) < TOL && sameSize(s.rect, rect))) return;
      const name = named ? src.getAttribute('data-name') || src.id || '' : '';
      const group = src.parentElement?.closest('g[data-name], g[id]');
      const groupName = group?.getAttribute('data-name') || group?.id || '';
      shapes.push({ id: shapes.length, rect, tag: src.tagName.toLowerCase(), name, groupName, role: 'ignore' });
    };

    for (const el of els) {
      if (el.closest('defs, clipPath, mask, symbol, pattern, marker, linearGradient, radialGradient')) continue;
      add(el, el, true);
      // Illustrator draws a card with photo windows as ONE compound path (outline + a hole per
      // window), so each subpath is measured too — the holes are the photo frames
      if (el.tagName.toLowerCase() !== 'path') continue;
      const subs = splitSubpaths(el.getAttribute('d') ?? '');
      if (subs.length < 2) continue;
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const tf = el.getAttribute('transform');
      if (tf) tmp.setAttribute('transform', tf);
      el.after(tmp);
      try {
        let prevEnd = { x: 0, y: 0 };
        for (const sub of subs) {
          const nums = sub.rest.match(NUM_RE);
          if (!nums || nums.length < 2) break;
          const base = sub.relative ? prevEnd : { x: 0, y: 0 };
          const start = { x: base.x + Number(nums[0]), y: base.y + Number(nums[1]) };
          // drop the two start coordinates; what follows a moveto is an implicit lineto
          let tail = sub.rest;
          for (let i = 0; i < 2; i++) tail = tail.replace(NUM_RE_ONCE, '');
          const implicit = /^[\s,]*[-+.\d]/.test(tail) ? (sub.relative ? 'l' : 'L') : '';
          tmp.setAttribute('d', `M${start.x},${start.y}${implicit}${tail}`);
          add(tmp, el, false);
          // a closed subpath leaves the pen at its start; an open one at its last point
          if (/[zZ]\s*$/.test(tail)) prevEnd = start;
          else {
            try {
              const end = tmp.getPointAtLength(tmp.getTotalLength());
              prevEnd = { x: end.x, y: end.y };
            } catch {
              prevEnd = start;
            }
          }
        }
      } finally {
        tmp.remove();
      }
    }
  } finally {
    host.remove();
  }

  if (!shapes.length) {
    throw new Error(`No shapes of ${MIN_SIDE_MM} mm or larger were found. Draw each photo area as a rectangle and export again.`);
  }
  guessRoles(shapes);

  // store with an explicit physical size so the artwork scales correctly as an image
  root.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  root.setAttribute('width', `${sheet.w}mm`);
  root.setAttribute('height', `${sheet.h}mm`);
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const clean = new XMLSerializer().serializeToString(root);
  const artwork = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;

  return { sheet, sizeSource, sizeGuessed, shapes, artwork, artworkBytes: artwork.length };
}

/** Rescale a parse result to a corrected physical sheet width (aspect is kept). */
export function rescale(p: ParsedSvg, sheetW: number): ParsedSvg {
  const f = sheetW / p.sheet.w;
  const s = (v: number) => r2(v * f);
  return {
    ...p,
    sheet: { w: r2(sheetW), h: s(p.sheet.h) },
    sizeSource: 'sheet width entered by hand',
    sizeGuessed: false,
    shapes: p.shapes.map((sh) => ({
      ...sh,
      rect: { x: s(sh.rect.x), y: s(sh.rect.y), w: s(sh.rect.w), h: s(sh.rect.h) },
    })),
  };
}

/** Photo frames in fill order: cut pieces in reading order, and the frames of each piece in
 *  reading order (so a 4-photo strip fills top to bottom before the next strip starts). */
export function orderedPhotos(shapes: DetectedShape[]): DetectedShape[] {
  const photos = shapes.filter((s) => s.role === 'photo');
  const cuts = readingOrder(shapes.filter((s) => s.role === 'cut'));
  const out: DetectedShape[] = [];
  for (const c of cuts) {
    out.push(...readingOrder(photos.filter((p) => !out.includes(p) && contains(c.rect, p.rect))));
  }
  out.push(...readingOrder(photos.filter((p) => !out.includes(p))));
  return out;
}

/** Build the printable template from the classified shapes. */
export function buildTemplate(p: ParsedSvg, opts: { printArtwork: boolean; keepArtwork: boolean }): TemplateDescriptor {
  const photos = orderedPhotos(p.shapes).map((s) => s.rect);
  const cuts = readingOrder(p.shapes.filter((s) => s.role === 'cut')).map((s) => s.rect);
  const custom: CustomLayout = {
    photos,
    cuts,
    artwork: opts.keepArtwork ? p.artwork : undefined,
    printArtwork: opts.keepArtwork && opts.printArtwork,
  };
  const first = photos[0] ?? { x: 0, y: 0, w: 0, h: 0 };
  const piece = cuts[0] ?? first;
  // order id goes in the right margin when the layout leaves one
  const right = Math.max(0, ...[...photos, ...cuts].map((r) => r.x + r.w));
  const gap = p.sheet.w - right;
  const idZone =
    gap >= 9
      ? { x: r2(right + (gap - 6) / 2), y: r2(p.sheet.h * 0.25), w: 6, h: r2(p.sheet.h * 0.5) }
      : { x: 0, y: 0, w: 0, h: 0 };
  return {
    sheet: p.sheet,
    card: { w: piece.w, h: piece.h },
    colX: [],
    rowTop: [],
    photo: { w: first.w, h: first.h },
    photoInset: 0,
    chin: 0,
    vBars: [],
    hStrips: [],
    idZone,
    custom,
  };
}
