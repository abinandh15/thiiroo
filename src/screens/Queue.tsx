import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orderKey, sheetCount, useStore } from '../store';
import type { Order } from '../lib/types';
import { blobUrl, timeHM } from '../lib/format';
import { ImportButton, StatusPill, ThemeToggle } from '../components/common';
import { packSizeOf, packWarning } from '../products';

type Filter = 'all' | 'review' | 'ready' | 'printed';

export function Queue() {
  const orders = useStore((s) => s.orders);
  const importQueue = useStore((s) => s.importQueue);
  const failedImports = useStore((s) => s.failedImports);
  const retryFailed = useStore((s) => s.retryFailed);
  const dismissFailed = useStore((s) => s.dismissFailed);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const importFiles = useStore((s) => s.importFiles);
  const buildBatch = useStore((s) => s.buildBatch);
  const markPrinted = useStore((s) => s.markPrinted);
  const combineMode = useStore((s) => s.combineMode);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'rows' | 'cards'>(
    (localStorage.getItem('thiiroo-queue-view') as 'rows' | 'cards') || 'rows'
  );
  const setViewPersist = (v: 'rows' | 'cards') => {
    localStorage.setItem('thiiroo-queue-view', v);
    setView(v);
  };
  const [query, setQuery] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const [drag, setDrag] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = {
    all: orders.length,
    review: orders.filter((o) => o.status === 'needs_review' || o.status === 'held').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    printed: orders.filter((o) => o.status === 'printed' || o.status === 'done').length,
  };

  const visible = useMemo(() => {
    let list = [...orders].sort((a, b) => a.importedAt - b.importedAt);
    if (filter === 'review') list = list.filter((o) => o.status === 'needs_review' || o.status === 'held');
    if (filter === 'ready') list = list.filter((o) => o.status === 'ready');
    if (filter === 'printed') list = list.filter((o) => o.status === 'printed' || o.status === 'done');
    if (query) list = list.filter((o) => o.id.includes(query) || o.itemId.includes(query));
    return list;
  }, [orders, filter, query]);

  const selectedOrders = orders.filter((o) => selection.has(orderKey(o)));
  const selPhotos = selectedOrders.reduce((n, o) => n + o.photos.length, 0);
  const selSheets = selectedOrders.reduce((n, o) => n + sheetCount(o), 0);

  // keyboard: up/down move, space select, enter open, / search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, visible.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === ' ') {
        e.preventDefault();
        const o = visible[focusIdx];
        if (o) {
          const k = orderKey(o);
          const next = new Set(selection);
          if (next.has(k)) next.delete(k); else next.add(k);
          setSelection(next);
        }
      } else if (e.key === 'Enter') {
        const o = visible[focusIdx];
        if (o) openOrder(o);
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openOrder(o: Order) {
    if (o.status === 'needs_review' || o.status === 'held') {
      navigate(`/p/instant-photo-prints/review/${encodeURIComponent(orderKey(o))}`);
    } else {
      navigate(`/p/instant-photo-prints/print/${encodeURIComponent(orderKey(o))}`);
    }
  }

  function toggle(o: Order) {
    const k = orderKey(o);
    const next = new Set(selection);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelection(next);
  }

  const importing = importQueue.filter((q) => q.state === 'decoding' || q.state === 'queued');
  const doneCount = importQueue.filter((q) => q.state === 'done').length;

  return (
    <div
      className="main"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="header">
        <span className="title">Instant Photo Prints</span>
        <span className="crumb">/ Queue</span>
        <span className="spacer" />
        <div className="search">
          <input ref={searchRef} placeholder="Search order ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="key">/</span>
        </div>
        <ThemeToggle />
        <button className="btn" onClick={() => navigate('/p/instant-photo-prints/review')}>Review queue →</button>
        <ImportButton />
      </header>

      <div className="toolbar">
        <div className="seg">
          {(
            [
              ['all', `All ${counts.all}`],
              ['review', `Needs review ${counts.review}`],
              ['ready', `Ready ${counts.ready}`],
              ['printed', `Printed ${counts.printed}`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="kbd-legend header">↑↓ move · space select · ↵ open</span>
        <div className="seg view-seg">
          <button className={view === 'rows' ? 'on' : ''} onClick={() => setViewPersist('rows')}>Rows</button>
          <button className={view === 'cards' ? 'on' : ''} onClick={() => setViewPersist('cards')}>Cards</button>
        </div>
      </div>

      {failedImports.length > 0 && (
        <div className="banner-error">
          <div className="t">
            {failedImports.length} zip{failedImports.length > 1 ? 's' : ''} could not be read
          </div>
          {failedImports.map((f) => (
            <div key={f.fileName} className="row">
              {f.fileName} — <span style={{ color: 'var(--ink-muted)' }}>{f.message}</span>
            </div>
          ))}
          <div className="actions">
            <button className="btn sm" onClick={() => void retryFailed()}>Retry</button>
            <button className="btn sm" onClick={dismissFailed}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="queue-body">
        <div className="queue-table-col">
          {view === 'rows' && (
            <div className="qhead">
              <span />
              <span>Order ID</span>
              <span>Item · Files</span>
              <span>Crops</span>
              <span>Qty</span>
              <span>Status</span>
              <span>Imported</span>
            </div>
          )}
          <div className={`queue-scroll${view === 'cards' ? ' as-cards' : ''}`}>
            {visible.length === 0 && (
              <div className="state-card">
                <div className="fanned">
                  <div className="pol"><i /></div>
                  <div className="pol"><i /></div>
                  <div className="pol"><i /></div>
                </div>
                <div className="h">No orders in the queue</div>
                <div className="b">
                  Seller Central → Manage Orders → the order → Customization Info → Download zip. Drop the zips
                  anywhere on this page — one per order item. Everything is processed on this machine.
                </div>
                <div className="actions"><ImportButton className="btn primary" /></div>
              </div>
            )}
            {view === 'cards' && visible.length > 0 && (
              <div className="qcards">
                {visible.map((o, i) => {
                  const k = orderKey(o);
                  const lowDpi = o.photos.filter((p) => !p.missing && p.dpi < 150).length;
                  const missing = o.photos.filter((p) => p.missing).length;
                  const isReview = o.status === 'needs_review' || o.status === 'held';
                  const isPrinted = o.status === 'printed' || o.status === 'done';
                  return (
                    <div
                      key={k}
                      className={[
                        'qcard',
                        selection.has(k) ? 'selected' : '',
                        isReview ? 'review' : '',
                        isPrinted ? 'printed' : '',
                        i === focusIdx ? 'focused' : '',
                      ].join(' ')}
                      onClick={() => { setFocusIdx(i); toggle(o); }}
                      onDoubleClick={() => openOrder(o)}
                    >
                      <div className="qcard-thumbs">
                        {o.photos.slice(0, 6).map((p) =>
                          p.missing ? (
                            <span key={p.id} className="thumb missing" />
                          ) : (
                            <img
                              key={p.id}
                              className={`thumb${p.dpi < 150 ? ' lowdpi' : ''}`}
                              src={blobUrl(p.cropBlob)}
                              alt=""
                            />
                          )
                        )}
                        {o.photos.length > 6 && <span className="thumb more">+{o.photos.length - 6}</span>}
                      </div>
                      <div className="qcard-head">
                        <input type="checkbox" checked={selection.has(k)} readOnly />
                        <span className="oid">{o.id}</span>
                        <span className="mono faint" style={{ marginLeft: 'auto' }}>×{o.qty}</span>
                      </div>
                      <div className="qcard-meta mono faint">
                        Item {o.itemId} · {packSizeOf(o) ? `pack of ${packSizeOf(o)} · ` : ''}{o.photos.length} JPGs · {timeHM(o.importedAt)}
                      </div>
                      {packWarning(o) && <div className="warnline">{packWarning(o)}</div>}
                      {lowDpi > 0 && <div className="warnline">{lowDpi} photo{lowDpi > 1 ? 's' : ''} below 150 DPI</div>}
                      {missing > 0 && <div className="warnline">{missing} image{missing > 1 ? 's' : ''} missing from zip</div>}
                      <div className="qcard-foot">
                        <StatusPill
                          status={o.status}
                          extra={o.status === 'ready' ? `${sheetCount(o)} sheet${sheetCount(o) > 1 ? 's' : ''}` : undefined}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {view === 'rows' && visible.map((o, i) => {
              const k = orderKey(o);
              const lowDpi = o.photos.filter((p) => !p.missing && p.dpi < 150).length;
              const missing = o.photos.filter((p) => p.missing).length;
              const isReview = o.status === 'needs_review' || o.status === 'held';
              const isPrinted = o.status === 'printed' || o.status === 'done';
              return (
                <div
                  key={k}
                  className={[
                    'qrow',
                    selection.has(k) ? 'selected' : '',
                    isReview ? 'review' : '',
                    isPrinted ? 'printed' : '',
                    i === focusIdx ? 'focused' : '',
                  ].join(' ')}
                  onClick={() => { setFocusIdx(i); toggle(o); }}
                  onDoubleClick={() => openOrder(o)}
                >
                  <input type="checkbox" checked={selection.has(k)} readOnly />
                  <span className="oid">{o.id}</span>
                  <span>
                    <div>
                      Item <span className="mono">{o.itemId}</span>{' '}
                      <span className="faint mono">· {packSizeOf(o) ? `pack of ${packSizeOf(o)} · ` : ''}{o.photos.length} buyer JPGs</span>
                    </div>
                    {packWarning(o) && <div className="warnline">{packWarning(o)}</div>}
                    {lowDpi > 0 && <div className="warnline">{lowDpi} photo{lowDpi > 1 ? 's' : ''} below 150 DPI</div>}
                    {missing > 0 && <div className="warnline">{missing} image{missing > 1 ? 's' : ''} referenced but missing from zip</div>}
                  </span>
                  <span className="thumbstrip">
                    {o.photos.map((p) =>
                      p.missing ? (
                        <span key={p.id} className="thumb missing" />
                      ) : (
                        <img
                          key={p.id}
                          className={`thumb${p.dpi < 150 ? ' lowdpi' : ''}`}
                          src={blobUrl(p.cropBlob)}
                          alt=""
                        />
                      )
                    )}
                  </span>
                  <span className="mono">{o.qty}</span>
                  <span>
                    <StatusPill
                      status={o.status}
                      extra={o.status === 'ready' ? `${sheetCount(o)} sheet${sheetCount(o) > 1 ? 's' : ''}` : undefined}
                    />
                  </span>
                  <span className="mono faint">{timeHM(o.importedAt)}</span>
                </div>
              );
            })}
          </div>

          {selection.size > 0 && (
            <div className="selbar">
              <strong>{selection.size} order{selection.size > 1 ? 's' : ''} selected</strong>
              <span className="meta">
                {selPhotos} photos · {selSheets} sheet{selSheets !== 1 ? 's' : ''} ·{' '}
                {combineMode === 'strict' ? '1 order per sheet' : 'combined part sheets'}
              </span>
              <button
                className="btn sm"
                onClick={() => {
                  const first = selectedOrders.find((o) => o.status === 'needs_review' || o.status === 'held');
                  if (first) navigate(`/p/instant-photo-prints/review/${encodeURIComponent(orderKey(first))}`);
                }}
              >
                Review selected
              </button>
              <button
                className="btn sm"
                onClick={() => markPrinted(selectedOrders.map(orderKey), false)}
              >
                Mark printed
              </button>
              <button
                className="btn sm white"
                onClick={() => {
                  buildBatch(selectedOrders.map(orderKey));
                  navigate('/p/instant-photo-prints/print-batch');
                }}
              >
                Build print batch →
              </button>
            </div>
          )}
        </div>

        <aside className="import-rail">
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            <div className="icon">↓</div>
            <div className="t">Drop Amazon order zips</div>
            <div className="s">One zip per order item — drop as many as you like. Nothing leaves this machine.</div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void importFiles(files);
              }}
            />
          </div>

          {importQueue.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="card-title" style={{ fontSize: 12 }}>Importing</span>
                <span className="mono faint" style={{ fontSize: 10.5 }}>
                  {doneCount} of {importQueue.length}
                </span>
              </div>
              <div className="progress-track" style={{ marginBottom: 10 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${(doneCount / Math.max(1, importQueue.length)) * 100}%` }}
                />
              </div>
              <div className="import-list">
                {importQueue.map((q) => (
                  <div key={q.fileName} className={`import-item${q.state === 'error' ? ' err' : ''}`}>
                    {q.state === 'done' ? (
                      <span className="ok-mark">✓</span>
                    ) : q.state === 'decoding' ? (
                      <span className="spin" />
                    ) : q.state === 'error' ? (
                      <span>×</span>
                    ) : (
                      <span className="faint">○</span>
                    )}
                    <span className="nm">{q.fileName}</span>
                    <span className="st">
                      {q.state === 'done' ? q.detail : q.state === 'decoding' ? q.detail ?? 'decoding' : q.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {importing.length === 0 && importQueue.length > 0 && (
            <button className="btn sm" onClick={() => useStore.setState({ importQueue: [] })}>Clear list</button>
          )}

          <div className="rail-note" style={{ marginTop: 'auto' }}>
            <strong style={{ color: 'var(--ink-muted)' }}>Where this comes from</strong>
            <br />
            Seller Central → Manage Orders → Customization Info → Download zip. Phase 3 replaces this panel with an
            Amazon inbox; drop stays as the fallback.
          </div>
        </aside>
      </div>
    </div>
  );
}
