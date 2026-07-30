import { CARD, H_STRIPS, ID_ZONE, PHOTO, PHOTO_INSET, ROW_TOP, SHEET, SLOTS_PER_SHEET, V_BARS, slotRect } from '../lib/geometry';
import type { SheetModel } from '../lib/sheets';
import { blobUrl } from '../lib/format';

export interface GuideOptions {
  greyBars: boolean;
  cropMarks: boolean;
  orderId: boolean;
  slotNumbers: boolean;
}

interface SheetProps {
  model: SheetModel;
  /** 'mm' renders with true physical units (print); a number is px-per-mm for screen */
  unit: 'mm' | number;
  guides: GuideOptions;
  shadow?: boolean;
}

/** Renders the A4 landscape template sheet. All geometry authored in mm. */
export function Sheet({ model, unit, guides, shadow }: SheetProps) {
  const u = (v: number) => (unit === 'mm' ? `${v}mm` : `${Math.round(v * unit * 100) / 100}px`);
  const markLen = 4; // mm, drawn inside the sheet edges
  const markThick = unit === 'mm' ? '0.15mm' : '1px';

  const columnEdges = [...new Set([22.0, 22.0 + CARD.w, 110.5, 110.5 + CARD.w, 198.8, 198.8 + CARD.w])];
  const rowEdges = [...new Set([ROW_TOP[0], ROW_TOP[1], ROW_TOP[1] + CARD.h])];

  return (
    <div
      className="sheet"
      style={{
        width: u(SHEET.w),
        height: u(SHEET.h),
        boxShadow: shadow ? 'var(--shadow-sheet)' : undefined,
      }}
    >
      {guides.greyBars &&
        V_BARS.map((b, i) => (
          <div key={`v${i}`} className="vbar" style={{ left: u(b.x), width: u(b.w) }} />
        ))}
      {guides.greyBars &&
        H_STRIPS.map((b, i) => (
          <div
            key={`h${i}`}
            className="hstrip"
            style={{ left: u(b.x), width: u(b.w), top: u(b.y), height: u(b.h) }}
          />
        ))}

      {Array.from({ length: SLOTS_PER_SHEET }, (_, slot) => {
        const r = slotRect(slot);
        const fill = model.slots[slot];
        const url = fill ? blobUrl(fill.photo.cropBlob) : undefined;
        return (
          <div
            key={slot}
            className="pcard"
            style={{ left: u(r.x), top: u(r.y), width: u(r.w), height: u(r.h) }}
          >
            <div
              className={`photo${fill ? '' : ' blank'}`}
              style={{
                left: u(PHOTO_INSET),
                top: u(PHOTO_INSET),
                width: u(PHOTO.w),
                height: u(PHOTO.h),
              }}
            >
              {url ? <img src={url} alt={fill!.photo.label} /> : fill ? null : <span className="screen-only">blank</span>}
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
            left: u(ID_ZONE.x),
            top: u(ID_ZONE.y),
            width: u(ID_ZONE.w),
            height: u(ID_ZONE.h),
            fontSize: unit === 'mm' ? '3mm' : `${unit * 3}px`,
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
