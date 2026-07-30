import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { allApproved, orderKey, sheetCount, useStore } from '../store';
import { blankCount, buildSheets } from '../lib/sheets';
import { Sheet } from '../components/Sheet';
import { ThemeToggle } from '../components/common';
import { printSheets } from '../lib/printJob';

export function BatchPrint() {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const batchKeys = useStore((s) => s.batchKeys);
  const combineMode = useStore((s) => s.combineMode);
  const setCombineMode = useStore((s) => s.setCombineMode);
  const guides = useStore((s) => s.guides);

  const [alsoDone, setAlsoDone] = useState(false);
  const [markPrintedAfter, setMarkPrintedAfter] = useState(true);

  const batchOrders = useMemo(() => {
    const chosen = batchKeys.length
      ? orders.filter((o) => batchKeys.includes(orderKey(o)))
      : orders.filter((o) => o.status === 'ready');
    return chosen;
  }, [orders, batchKeys]);

  const notReady = batchOrders.filter((o) => !allApproved(o) && o.status !== 'ready');
  const printable = batchOrders.filter((o) => allApproved(o) || o.status === 'ready');
  const sheets = useMemo(() => buildSheets(printable, combineMode), [printable, combineMode]);
  const strictSheets = useMemo(() => buildSheets(printable, 'strict'), [printable]);
  const partials = strictSheets.filter((s) => blankCount(s) > 0).length;
  const saved = strictSheets.length - buildSheets(printable, 'combine').length;
  const totalPhotos = printable.reduce((n, o) => n + o.photos.filter((p) => !p.missing).length, 0);

  const doPrint = () => {
    printSheets(sheets, printable.map(orderKey));
  };

  return (
    <div className="main">
      <header className="header">
        <a onClick={() => navigate('/p/instant-photo-prints/queue')} style={{ cursor: 'pointer', fontSize: 12 }}>← Queue</a>
        <span className="title">Batch print</span>
        <span className="crumb mono">
          {printable.length} orders · {totalPhotos} photos · {sheets.length} sheets
        </span>
        <span className="spacer" />
        <ThemeToggle />
        <button className="btn" onClick={doPrint} title="Choose 'Save as PDF' as the destination">
          Export PDF ({sheets.length} pages)
        </button>
        <button className="btn primary" onClick={doPrint} disabled={!sheets.length}>
          Print {sheets.length} sheet{sheets.length !== 1 ? 's' : ''} ⌘P
        </button>
      </header>

      <div className="batch-body">
        <div className="batch-grid-wrap">
          {printable.length === 0 ? (
            <div className="card state-card">
              <div className="h">No orders in this batch</div>
              <div className="b">
                Select approved orders in the queue and hit "Build print batch", or approve orders in Review — every
                ready order lands here automatically.
              </div>
              <div className="actions">
                <button className="btn primary" onClick={() => navigate('/p/instant-photo-prints/queue')}>
                  Open queue
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="batch-grid">
                {sheets.map((s, i) => (
                  <div key={i} className="batch-page">
                    <Sheet model={s} unit={1.15} guides={guides} shadow />
                    <div className="cap">
                      Page {i + 1} · <span>{s.orderIds.join(' + ')}</span> ·{' '}
                      {blankCount(s) > 0 ? (
                        <span className="part">{6 - blankCount(s)}/6</span>
                      ) : (
                        '6/6'
                      )}
                      {s.copyNote ? ` · ${s.copyNote}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              {combineMode === 'strict' && partials > 0 && saved > 0 && (
                <div className="notice-row" style={{ marginTop: 14 }}>
                  {partials} sheet{partials > 1 ? 's have' : ' has'} blanks ·{' '}
                  <span className="suggest" onClick={() => setCombineMode('combine')}>
                    Combine part sheets → saves {saved} sheet{saved > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="batch-panel">
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Orders in batch</div>
            {batchOrders.map((o) => (
              <div key={orderKey(o)} className="kv">
                <span className="k">{o.id}</span>
                <span className="v">
                  {allApproved(o) || o.status === 'ready'
                    ? `${sheetCount(o)} sheet${sheetCount(o) !== 1 ? 's' : ''}`
                    : 'not approved — skipped'}
                </span>
              </div>
            ))}
            {notReady.length > 0 && (
              <div className="warn-card" style={{ marginTop: 10 }}>
                <div className="t">! {notReady.length} order{notReady.length > 1 ? 's' : ''} skipped</div>
                Review is a hard gate — approve every photo first.
              </div>
            )}
          </div>

          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>Composition</div>
            <div className={`radio-card${combineMode === 'strict' ? ' on' : ''}`} onClick={() => setCombineMode('strict')} style={{ marginBottom: 8 }}>
              <span className="r" />
              <span>
                <div className="t">One order per sheet</div>
                <div className="s">Cut stack never mixes buyers.</div>
              </span>
            </div>
            <div className={`radio-card${combineMode === 'combine' ? ' on' : ''}`} onClick={() => setCombineMode('combine')}>
              <span className="r" />
              <span>
                <div className="t">Combine part sheets</div>
                <div className="s">Both IDs print in the margin.</div>
              </span>
            </div>
          </div>

          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>Before you print</div>
            <div className="check-row"><span className="m ok">✓</span><span>Paper: A4 landscape</span></div>
            <div className="check-row"><span className="m ok">✓</span><span>Margins: None · Scale: 100%</span></div>
            <div className="check-row"><span className="m ok">✓</span><span>Background graphics: ON</span></div>
            <div className="check-row"><span className="m warn">▲</span><span>Headers &amp; footers: OFF</span></div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.55 }}>
              Chrome remembers these per printer.
            </div>
          </div>

          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>After printing</div>
            <div className="toggle-row" onClick={() => setMarkPrintedAfter(!markPrintedAfter)}>
              <span className={`switch${markPrintedAfter ? ' on' : ''}`} />
              <span>Offer to mark {printable.length} order{printable.length !== 1 ? 's' : ''} printed</span>
            </div>
            <div className="toggle-row" onClick={() => setAlsoDone(!alsoDone)}>
              <span className={`switch${alsoDone ? ' on' : ''}`} />
              <span>Also mark cut &amp; laminated</span>
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.55 }}>
              A confirmation appears after the print dialog closes.
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn primary" onClick={doPrint} disabled={!sheets.length}>
              Print {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
            </button>
            <button className="btn" onClick={doPrint}>Export PDF</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
