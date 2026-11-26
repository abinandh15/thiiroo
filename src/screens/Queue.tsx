import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orderKey, sheetCount, useStore } from '../store';
import type { Order } from '../lib/types';
import { blobUrl, timeHM } from '../lib/format';
import { ImportButton, StatusPill } from '../components/common';
import { ImportDrop } from '../components/ImportDrop';
import '../styles/pipeline.css';
import { listProducts, packSizeOf, packWarning, productPath, resolveProduct } from '../products';
import { aspectWarning, useProductOrders, useProductTemplate, useRouteProduct } from '../products/useRouteProduct';

type Filter = 'all' | 'review' | 'ready' | 'printed';

export function Queue() {
  const product = useRouteProduct();
  const allOrders = useStore((s) => s.orders);
  const orders = useProductOrders(product);
  const template = useProductTemplate(product);
  const otherProducts = listProducts().filter((p) => p.id !== product.id);
  const unassignedCount = allOrders.filter((o) => !resolveProduct(o)).length;
  const assignProduct = useStore((s) => s.assignProduct);
  const failedImports = useStore((s) => s.failedImports);
  const retryFailed = useStore((s) => s.retryFailed);
  const dismissFailed = useStore((s) => s.dismissFailed);
  const duplicateImports = useStore((s) => s.duplicateImports);
  const replaceDuplicates = useStore((s) => s.replaceDuplicates);
  const dismissDuplicates = useStore((s) => s.dismissDuplicates);
  const reopenReview = useStore((s) => s.reopenReview);
  const removeOrder = useStore((s) => s.removeOrder);
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
  const [, setDrag] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
  const selectedCount = selectedOrders.length;
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
      navigate(productPath(product.id, `review/${encodeURIComponent(orderKey(o))}`));
    } else {
      navigate(productPath(product.id, `print/${encodeURIComponent(orderKey(o))}`));
    }
  }

  function toggle(o: Order) {
    const k = orderKey(o);
    const next = new Set(selection);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelection(next);
  }

  const isReviewStatus = (o: Order) => o.status === 'needs_review' || o.status === 'held';
  const hasWarning = (o: Order) =>
    o.photos.some((p) => p.missing || p.dpi < 150) || !!packWarning(o);
  const reviewOrders = orders.filter(isReviewStatus);
  const readyOrders = orders.filter((o) => o.status === 'ready');
  const donePast = orders.filter((o) => o.status === 'printed' || o.status === 'done');
  const reviewWarn = reviewOrders.filter(hasWarning).length;
  const readySheets = readyOrders.reduce((n, o) => n + sheetCount(o), 0);
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const printedToday = donePast.filter((o) => (o.printedAt ?? 0) >= startOfToday).length;
  const openCount = reviewOrders.length + readyOrders.length;
  const filterName: Record<Filter, string> = {
    all: 'All orders', review: 'Needs review', ready: 'Ready', printed: 'Printed',
  };

  function rowAction(o: Order) {
    const k = encodeURIComponent(orderKey(o));
    if (isReviewStatus(o)) return { label: 'Review', cls: 'btn sm dark', to: productPath(product.id, `review/${k}`) };
    return {
      label: o.status === 'ready' ? 'Print' : 'Reprint',
      cls: 'btn sm',
      to: productPath(product.id, `print/${k}`),
    };
  }
  function ActionBtn({ o }: { o: Order }) {
    const a = rowAction(o);
    return (
      <button className={a.cls} onClick={(e) => { e.stopPropagation(); navigate(a.to); }}>{a.label}</button>
    );
  }
  function WarnPills({ o }: { o: Order }) {
    const lowDpi = o.photos.filter((p) => !p.missing && p.dpi < 150).length;
    const missing = o.photos.filter((p) => p.missing).length;
    return (
      <>
        {lowDpi > 0 && <span className="pill warn">Low DPI · {lowDpi}</span>}
        {missing > 0 && <span className="pill warn">{missing} missing</span>}
      </>
    );
  }

  return (
    <div
      className="main pl-page"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="header">
        <span className="title">{product.name}</span>
        <span className="pl-sub">
          {product.sizeLabel} · {openCount} open order{openCount !== 1 ? 's' : ''}
        </span>
        <span className="spacer" />
        <div className="search">
          <input ref={searchRef} placeholder="Search order ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="key">/</span>
        </div>
        <ImportButton />
      </header>

      <div className="pl-stages">
        <div className="pl-stage pl-import card">
          <ImportDrop compact />
        </div>
        <div
          className={`pl-stage card att${filter === 'review' ? ' on' : ''}`}
          onClick={() => setFilter('review')}
        >
          <div className="pl-k"><i>2</i>Review</div>
          <div className="pl-v">{reviewOrders.length}</div>
          <div className="pl-s">orders · {reviewWarn} with a warning</div>
          <button
            className="btn sm dark pl-go"
            disabled={reviewOrders.length === 0}
            onClick={(e) => { e.stopPropagation(); navigate(productPath(product.id, 'review')); }}
          >
            Start
          </button>
        </div>
        <div
          className={`pl-stage card rdy${filter === 'ready' ? ' on' : ''}`}
          onClick={() => setFilter('ready')}
        >
          <div className="pl-k"><i>3</i>Print</div>
          <div className="pl-v">{readyOrders.length}</div>
          <div className="pl-s">orders · {readySheets} sheet{readySheets !== 1 ? 's' : ''}</div>
          <button
            className="btn sm pl-go"
            disabled={readyOrders.length === 0}
            onClick={(e) => {
              e.stopPropagation();
              buildBatch(readyOrders.map(orderKey));
              navigate(productPath(product.id, 'print-batch'));
            }}
          >
            Print all
          </button>
        </div>
        <div
          className={`pl-stage card${filter === 'printed' ? ' on' : ''}`}
          onClick={() => setFilter('printed')}
        >
          <div className="pl-k"><i>✓</i>Done</div>
          <div className="pl-v">{donePast.length}</div>
          <div className="pl-s">orders · {printedToday} printed today</div>
        </div>
      </div>

      {unassignedCount > 0 && (
        <div className="banner-warn">
          <div className="t">
            {unassignedCount} order{unassignedCount > 1 ? 's' : ''} with an unknown ASIN {unassignedCount > 1 ? 'are' : 'is'} waiting for a template
          </div>
          <div className="actions">
            <button className="btn sm" onClick={() => navigate('/unassigned')}>Assign template →</button>
          </div>
        </div>
      )}

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

      {duplicateImports.length > 0 && (
        <div className="banner-warn">
          <div className="t">
            {duplicateImports.length} zip{duplicateImports.length > 1 ? 's' : ''} matched order
            {duplicateImports.length > 1 ? 's' : ''} already in the queue — kept the existing version
            {duplicateImports.length > 1 ? 's' : ''}
          </div>
          {duplicateImports.map((d) => (
            <div key={d.fileName} className="row">
              {d.fileName} — <span style={{ color: 'var(--ink-muted)' }}>
                existing order is {d.existingStatus.replace('_', ' ')}; replacing discards its review work
              </span>
            </div>
          ))}
          <div className="actions">
            <button className="btn sm" onClick={() => replaceDuplicates(duplicateImports.map((d) => d.fileName))}>
              Replace anyway
            </button>
            <button className="btn sm" onClick={dismissDuplicates}>Keep existing</button>
          </div>
        </div>
      )}

      <div className="card pl-list">
        <div className="pl-lhead">
          <b>{filterName[filter]}</b>
          <span className="pl-count">{visible.length} order{visible.length !== 1 ? 's' : ''}</span>
          <span className="spacer" />
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
          <div className="seg view-seg">
            <button className={view === 'rows' ? 'on' : ''} onClick={() => setViewPersist('rows')}>Rows</button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setViewPersist('cards')}>Cards</button>
          </div>
        </div>
          {view === 'rows' && (
            <div className="qhead">
              <span />
              <span>Order ID</span>
              <span>Item · Files</span>
              <span>Crops</span>
              <span>Status</span>
              <span />
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
                      {aspectWarning(o, template) && <div className="warnline">{aspectWarning(o, template)}</div>}
                      {lowDpi > 0 && <div className="warnline">{lowDpi} photo{lowDpi > 1 ? 's' : ''} below 150 DPI</div>}
                      {missing > 0 && <div className="warnline">{missing} image{missing > 1 ? 's' : ''} missing from zip</div>}
                      <div className="qcard-foot">
                        <StatusPill
                          status={o.status}
                          extra={o.status === 'ready' ? `${sheetCount(o)} sheet${sheetCount(o) > 1 ? 's' : ''}` : undefined}
                        />
                        <ActionBtn o={o} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {view === 'rows' && visible.map((o, i) => {
              const k = orderKey(o);
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
                  <span>
                    <div className="oid">{o.id}</div>
                    <div className="pl-meta mono">
                      {o.qty > 1 ? `×${o.qty} · ` : ''}imported {timeHM(o.importedAt)}
                    </div>
                  </span>
                  <span>
                    <div>
                      Item <span className="mono">{o.itemId}</span>{' '}
                      <span className="faint mono">· {packSizeOf(o) ? `pack of ${packSizeOf(o)} · ` : ''}{o.photos.length} buyer JPGs</span>
                    </div>
                    {packWarning(o) && <div className="warnline">{packWarning(o)}</div>}
                    {aspectWarning(o, template) && <div className="warnline">{aspectWarning(o, template)}</div>}
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
                  <span className="pl-status">
                    <StatusPill
                      status={o.status}
                      extra={o.status === 'ready' ? `${sheetCount(o)} sheet${sheetCount(o) > 1 ? 's' : ''}` : undefined}
                    />
                    <WarnPills o={o} />
                  </span>
                  <ActionBtn o={o} />
                </div>
              );
            })}
          </div>

          {selectedCount > 0 && (
            <div className="selbar">
              <strong>{selectedCount} order{selectedCount > 1 ? 's' : ''} selected</strong>
              <span className="meta">
                {selPhotos} photos · {selSheets} sheet{selSheets !== 1 ? 's' : ''} ·{' '}
                {combineMode === 'strict' ? '1 order per sheet' : 'combined part sheets'}
              </span>
              <button
                className="btn sm"
                onClick={() => {
                  const first = selectedOrders.find((o) => o.status === 'needs_review' || o.status === 'held');
                  if (first) navigate(productPath(product.id, `review/${encodeURIComponent(orderKey(first))}`));
                }}
              >
                Review selected
              </button>
              {selectedOrders.some((o) => o.status === 'ready' || o.status === 'printed' || o.status === 'done') && (
                <button
                  className="btn sm"
                  title="Send back through the review gate (approvals are kept)"
                  onClick={() => {
                    const past = selectedOrders.filter(
                      (o) => o.status === 'ready' || o.status === 'printed' || o.status === 'done'
                    );
                    for (const o of past) reopenReview(orderKey(o));
                    navigate(productPath(product.id, `review/${encodeURIComponent(orderKey(past[0]))}`));
                  }}
                >
                  Reopen review
                </button>
              )}
              <button
                className="btn sm"
                onClick={() => markPrinted(selectedOrders.map(orderKey), false)}
              >
                Mark printed
              </button>
              {otherProducts.length > 0 && (
                <select
                  className="btn sm selbar-move"
                  value=""
                  title="Print the selected orders with another template"
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    assignProduct(selectedOrders.map(orderKey), id, false);
                    setSelection(new Set());
                  }}
                >
                  <option value="">Move to…</option>
                  {otherProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <button
                className="btn sm"
                title="Delete the selected orders and their activity history"
                onClick={() => {
                  const n = selectedOrders.length;
                  const ok = window.confirm(
                    `Remove ${n} order${n > 1 ? 's' : ''} from the dashboard?\n\n` +
                      'Photos, review work and activity history are discarded. ' +
                      'Re-importing the zip brings the order back as new.'
                  );
                  if (!ok) return;
                  for (const o of selectedOrders) removeOrder(orderKey(o));
                }}
              >
                Remove…
              </button>
              <button
                className="btn sm white"
                onClick={() => {
                  buildBatch(selectedOrders.map(orderKey));
                  navigate(productPath(product.id, 'print-batch'));
                }}
              >
                Build print batch →
              </button>
            </div>
          )}
        <div className="pl-legend">↑↓ move · space select · ↵ open · / search</div>
      </div>
    </div>
  );
}
