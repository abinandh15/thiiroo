import { useState } from 'react';
import { DEFAULT_TEMPLATE, slotRect, slotsPerSheet } from '../lib/geometry';
import type { TemplateDescriptor } from '../lib/geometry';
import type { SheetModel } from '../lib/sheets';
import { blobUrl } from '../lib/format';

export interface GuideOptions {
  greyBars: boolean;
  cropMarks: boolean;
  /** thin red cut guides flowing across the whole sheet at every card edge (as in the Illustrator file) */
  cutLines: boolean;
  orderId: boolean;
  slotNumbers: boolean;
}

interface SheetProps {
  model: SheetModel;
  /** 'mm' renders with true physical units (print); a number is px-per-mm for screen */
  unit: 'mm' | number;
  guides: GuideOptions;
  shadow?: boolean;
  /** screen only: makes filled slots draggable; called with the two slot indexes to swap */
  onSwapSlots?: (a: number, b: number) => void;
  /** sheet layout to render; defaults to the verified Instant Photo Prints template */
  template?: TemplateDescriptor;
}

/** Renders the A4 landscape template sheet. All geometry authored in mm. */
export function Sheet({ model, unit, guides, shadow, onSwapSlots, template }: SheetProps) {
  const t = template ?? DEFAULT_TEMPLATE;
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const u = (v: number) => (unit === 'mm' ? `${v}mm` : `${Math.round(v * unit * 100) / 100}px`);
  const markLen = 2; // mm, drawn inside the sheet edges
  const markThick = unit === 'mm' ? '0.15mm' : '1px';

  const columnEdges = [...new Set(t.colX.flatMap((x) => [x, x + t.card.w]))];
  const rowEdges = [...new Set([...t.rowTop, t.rowTop[t.rowTop.length - 1] + t.card.h])];
  // the printed frame spans the grey strips; red cut guides live only in the bare margins outside it
  const frameL = t.hStrips.length ? Math.min(...t.hStrips.map((s) => s.x)) : markLen;
  // const frameR = t.hStrips.length ? Math.max(...t.hStrips.map((s) => s.x + s.w)) : t.sheet.w - markLen;
  const frameR = t.hStrips.length ? 5 : t.sheet.w - markLen;

  return (
    <div
      className="sheet"
      style={{
        width: u(t.sheet.w),
        height: u(t.sheet.h),
        boxShadow: shadow ? 'var(--shadow-sheet)' : undefined,
      }}
    >
      {guides.greyBars &&
        t.vBars.map((b, i) => (
          <div key={`v${i}`} className="vbar" style={{ left: u(b.x), width: u(b.w) }} />
        ))}
      {guides.greyBars &&
        t.hStrips.map((b, i) => (
          <div
            key={`h${i}`}
            className="hstrip"
            style={{ left: u(b.x), width: u(b.w), top: u(b.y), height: u(b.h) }}
          />
        ))}

      {/* red cut guides: short ticks in the outer margins only — never across the print area */}
      {guides.cutLines && rowEdges.map((y, i) => (
        <span key={`cl${i}`}>
          <i className="cutline" style={{ top: u(y), left: 0, width: u(frameL), height: markThick }} />
          <i className="cutline" style={{ top: u(y), left: u(frameR), width: u(t.sheet.w - frameR), height: markThick }} />
        </span>
      ))}

      {Array.from({ length: slotsPerSheet(t) }, (_, slot) => {
        const r = slotRect(slot, t);
        const fill = model.slots[slot];
        const url = fill ? blobUrl(fill.photo.cropBlob) : undefined;
        const draggable = !!onSwapSlots && !!fill;
        return (
          <div
            key={slot}
            className={[
              'pcard',
              draggable ? 'swappable' : '',
              dragSlot === slot ? 'dragging' : '',
              overSlot === slot && dragSlot !== null && dragSlot !== slot ? 'dropover' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: u(r.x), top: u(r.y), width: u(r.w), height: u(r.h) }}
            draggable={draggable}
            onDragStart={draggable ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(slot));
              setDragSlot(slot);
            } : undefined}
            onDragEnd={draggable ? () => { setDragSlot(null); setOverSlot(null); } : undefined}
            onDragOver={onSwapSlots && fill ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverSlot(slot);
            } : undefined}
            onDragLeave={onSwapSlots ? () => setOverSlot((s) => (s === slot ? null : s)) : undefined}
            onDrop={onSwapSlots && fill ? (e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData('text/plain'));
              setDragSlot(null);
              setOverSlot(null);
              if (Number.isInteger(from) && from !== slot && model.slots[from]) onSwapSlots(from, slot);
            } : undefined}
          >
            <div
              className={`photo${fill ? '' : ' blank'}`}
              style={{
                left: u(t.photoInset),
                top: u(t.photoInset),
                width: u(t.photo.w),
                height: u(t.photo.h),
              }}
            >
              {url ? <img src={url} alt={fill!.photo.label} draggable={false} /> : fill ? null : <span className="screen-only">blank</span>}
              {guides.slotNumbers && fill && <span className="slotnum screen-only">{slot + 1}</span>}
            </div>
            {/* the 15.9mm chin is simply the card area left white below the photo */}
          </div>
        );
      })}

      {guides.orderId && (
        <div
          className="oid-margin"
          style={{
            left: u(t.idZone.x),
            top: u(t.idZone.y),
            width: u(t.idZone.w),
            height: u(t.idZone.h),
            fontSize: unit === 'mm' ? '4mm' : `${unit * 4}px`,
          }}
        >
          {model.orderIds.join('  ·  ')}
        </div>
      )}

      {guides.cropMarks && (
        <>
          {columnEdges.map((x, i) => (
            <span key={`cmt${i}`}>
              <i className="cropmark" style={{ left: u(x), top: 0, width: markThick, height: u(markLen) }} />
              <i className="cropmark" style={{ left: u(x), bottom: 0, width: markThick, height: u(markLen) }} />
            </span>
          ))}
          {rowEdges.map((y, i) => (
            <span key={`cml${i}`}>
              <i className="cropmark" style={{ top: u(y), left: 0, height: markThick, width: u(markLen) }} />
              <i className="cropmark" style={{ top: u(y), right: 0, height: markThick, width: u(markLen) }} />
            </span>
          ))}
        </>
      )}
    </div>
  );
}
