import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { orderKey, useStore } from '../store';
import { productPath, resolveProduct } from '../products';
import { useProductOrders, useProductTemplate, useRouteProduct } from '../products/useRouteProduct';
import { photoFrame, slotsPerSheet } from '../lib/geometry';
import { buildSheets } from '../lib/sheets';
import { Sheet } from '../components/Sheet';
import { ThemeToggle } from '../components/common';
import { printSheets } from '../lib/printJob';
import { blobUrl } from '../lib/format';

export function PrintLayout() {
  const { key: rawKey } = useParams();
  const navigate = useNavigate();
  const product = useRouteProduct();
  const allOrders = useStore((s) => s.orders);
  const orders = useProductOrders(product);
  const guides = useStore((s) => s.guides);
  const setGuide = useStore((s) => s.setGuide);
  const combineMode = useStore((s) => s.combineMode);
  const setCombineMode = useStore((s) => s.setCombineMode);
  const swapPhotos = useStore((s) => s.swapPhotos);
  const reopenReview = useStore((s) => s.reopenReview);
  const template = useProductTemplate(product);
  const slots = slotsPerSheet(template);

  const key = rawKey ? decodeURIComponent(rawKey) : undefined;
  const order = orders.find((o) => orderKey(o) === key) ?? orders.find((o) => o.status === 'ready');
  const sheets = useMemo(() => (order ? buildSheets([order], 'strict', slots) : []), [order, slots]);
  const [cur, setCur] = useState(0);
  const sheet = sheets[Math.min(cur, sheets.length - 1)];

  // the URL names an order that belongs to another template (or to none): follow it there
  const elsewhere = key && !orders.some((o) => orderKey(o) === key) ? allOrders.find((o) => orderKey(o) === key) : undefined;
  if (elsewhere) {
    const home = resolveProduct(elsewhere);
    return home ? (
      <Navigate replace to={productPath(home.id, `print/${encodeURIComponent(orderKey(elsewhere))}`)} />
    ) : (
      <Navigate replace to="/unassigned" />
    );
  }

  if (!order) {
    return (
      <div className="main">
        <header className="header">
          <a onClick={() => navigate(productPath(product.id, 'queue'))} style={{ cursor: 'pointer' }}>← Queue</a>
          <span className="title">Print layout</span>
          <span className="spacer" />
          <ThemeToggle />
        </header>
        <div className="content">
          <div className="card state-card">
            <div className="h">No order to lay out</div>
            <div className="b">Approve an order in Review first, then open it here to see its physical sheet.</div>
          </div>
        </div>
      </div>
    );
  }

  const k = orderKey(order);

  const frame = photoFrame(template);
  const sheetSize = `${template.sheet.w}mm ${template.sheet.h}mm`;
  const isA4Landscape = template.sheet.w === 297 && template.sheet.h === 210;

  const swapSlots = (a: number, b: number) => {
    const fa = sheet?.slots[a];
    const fb = sheet?.slots[b];
    if (fa && fb) swapPhotos(k, fa.photo.id, fb.photo.id);
  };

  return (
    <div className="main">
      <header className="header">
        <a onClick={() => navigate(productPath(product.id, 'queue'))} style={{ cursor: 'pointer', fontSize: 12 }}>← Queue</a>
        <span className="title">Print layout</span>
        <span className="crumb mono">
          {order.id} · sheet {Math.min(cur, sheets.length - 1) + 1} of {sheets.length}
        </span>
        <span className="spacer" />
        <ThemeToggle />
        <button
          className="btn"
          title="Send back through the review gate (approvals are kept)"
          onClick={() => {
            reopenReview(k);
            navigate(productPath(product.id, `review/${encodeURIComponent(k)}`));
          }}
        >
          Reopen review
        </button>
        <button className="btn" onClick={() => printSheets(sheets, [k], template)} title="Use the dialog's 'Save as PDF' destination">
          Export PDF
        </button>
        <button className="btn primary" onClick={() => printSheets(sheets, [k], template)}>
          Print {sheets.length > 1 ? `${sheets.length} sheets` : 'sheet'} ⌘P
        </button>
      </header>

      <div className="print-body">
        <aside className="sheet-rail">
          <div className="section-label">Sheets</div>
          {sheets.map((s, i) => (
            <div key={i} className={`sheet-thumb${i === cur ? ' current' : ''}`} onClick={() => setCur(i)}>
              <Sheet model={s} unit={0.47} guides={{ ...guides, slotNumbers: false }} template={template} />
              <div className="cap">
                Sheet {i + 1} · {s.slots.filter(Boolean).length} photos{s.copyNote ? ` · ${s.copyNote}` : ''}
              </div>
            </div>
          ))}
          <div className="foot">
            More photos or qty &gt; 1 paginate into extra sheets. Every sheet carries the order ID.
          </div>
        </aside>

        <div className="sheet-canvas">
          {sheet && <Sheet model={sheet} unit={2} guides={guides} shadow onSwapSlots={swapSlots} template={template} />}
          <div className="sheet-readout">
            <span>{template.sheet.w} × {template.sheet.h} mm{isA4Landscape ? ' · A4 landscape' : ''}</span>
            {template.custom ? (
              <>
                <span>{slots} frame{slots === 1 ? '' : 's'} per sheet</span>
                <span>frame {Math.round(frame.w * 10) / 10} × {Math.round(frame.h * 10) / 10} mm</span>
              </>
            ) : (
              <>
                <span>card {template.card.w} × {template.card.h} mm</span>
                <span>photo {template.photo.w} × {template.photo.h} mm</span>
                <span>chin {template.chin} mm</span>
              </>
            )}
            <span className="zoom-chip">zoom 2 px/mm</span>
          </div>
        </div>

        <aside className="options-panel">
          <div>
            <div className="card-title" style={{ marginBottom: 10 }}>Sheet composition</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className={`radio-card${combineMode === 'strict' ? ' on' : ''}`} onClick={() => setCombineMode('strict')}>
                <span className="r" />
                <span>
                  <div className="t">One order per sheet</div>
                  <div className="s">Blanks stay empty. Cut stack never mixes buyers. Default.</div>
                </span>
              </div>
              <div className={`radio-card${combineMode === 'combine' ? ' on' : ''}`} onClick={() => setCombineMode('combine')}>
                <span className="r" />
                <span>
                  <div className="t">Combine part sheets</div>
                  <div className="s">Fill blanks from the next order in a batch. Both IDs print in the margin.</div>
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>Guides</div>
            {(
              [
                ['greyBars', 'Grey cut-waste bars'],
                ['cropMarks', 'Crop marks'],
                ['cutLines', 'Cut guide lines (red)'],
                ['orderId', 'Order ID in right margin'],
                ['slotNumbers', 'Slot numbers (screen only)'],
              ] as const
            ).map(([g, label]) => (
              <div key={g} className="toggle-row" onClick={() => setGuide(g, !guides[g])}>
                <span className={`switch${guides[g] ? ' on' : ''}`} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>Slots</div>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.55, marginBottom: 8 }}>
              Photos fill in buyer order — drag a card on the sheet to swap two slots.
            </div>
            <div className="slot-chips">
              {sheet?.slots.map((fill, i) => (
                <span key={i} className={`slot-chip${fill ? '' : ' blank'}`}>
                  {fill && <img src={blobUrl(fill.photo.cropBlob)} alt="" draggable={false} />}
                  <i>{i + 1}</i>
                </span>
              ))}
            </div>
          </div>

          <div className="css-card">
            <strong style={{ color: 'var(--ink)' }}>Print stylesheet</strong>
            <br />@page {'{'} size: {sheetSize}; margin: 0 {'}'}
            <br />prints: .sheet only
            <br />hides: chrome, panels, screen-only guides
            <br />Chrome dialog: scale 100%, background graphics ON
          </div>
        </aside>
      </div>
    </div>
  );
}
