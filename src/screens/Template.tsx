import { ThemeToggle } from '../components/common';
import { Sheet } from '../components/Sheet';
import { CARD, CHIN, COL_X, PHOTO, PHOTO_INSET, ROW_TOP, SHEET } from '../lib/geometry';
import type { SheetModel } from '../lib/sheets';

const emptyModel: SheetModel = {
  orderIds: ['403-XXXXXXX-XXXXXXX'],
  slots: [null, null, null, null, null, null],
};

export function Template() {
  return (
    <div className="main">
      <header className="header">
        <span className="title">Instant Photo Prints</span>
        <span className="crumb">/ Template</span>
        <span className="spacer" />
        <ThemeToggle />
      </header>
      <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <div className="sheet-canvas card" style={{ flex: 1, padding: 26 }}>
          <Sheet
            model={emptyModel}
            unit={2}
            guides={{ greyBars: true, cropMarks: true, orderId: true, slotNumbers: true }}
            shadow
          />
        </div>
        <div className="card card-pad" style={{ width: 300 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Template geometry</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
            Extracted from the Illustrator print file. All layout is authored in mm so screen and paper agree.
          </div>
          <div className="kv"><span className="k">sheet</span><span className="v">{SHEET.w} × {SHEET.h} mm (A4 ⇥)</span></div>
          <div className="kv"><span className="k">card</span><span className="v">{CARD.w} × {CARD.h} mm (3″×4″)</span></div>
          <div className="kv"><span className="k">photo area</span><span className="v">{PHOTO.w} × {PHOTO.h} mm</span></div>
          <div className="kv"><span className="k">photo inset</span><span className="v">{PHOTO_INSET} mm (l/r/t)</span></div>
          <div className="kv"><span className="k">chin</span><span className="v">{CHIN} mm</span></div>
          <div className="kv"><span className="k">columns at</span><span className="v">{COL_X.join(' / ')} mm</span></div>
          <div className="kv"><span className="k">rows at</span><span className="v">{ROW_TOP.join(' / ')} mm</span></div>
          <div className="kv"><span className="k">crop window</span><span className="v">219 × 260 @ (90,50)</span></div>
          <div className="kv"><span className="k">output crop</span><span className="v">1095 × 1300 px</span></div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.6 }}>
            Phase 2 turns this page into a per-product template editor. For now it documents the single hard-coded
            layout.
          </div>
        </div>
      </div>
    </div>
  );
}
