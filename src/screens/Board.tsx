import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/board.css';
import { orderKey, sheetCount, useStore } from '../store';
import type { Order } from '../lib/types';
import { blobUrl, timeHM } from '../lib/format';
import { StatusPill } from '../components/common';
import { ImportDrop } from '../components/ImportDrop';
import { listProducts, packSizeOf, packWarning, productPath, resolveProduct } from '../products';

const isOpen = (o: Order) => o.status !== 'printed' && o.status !== 'done';
const isReview = (o: Order) => o.status === 'needs_review' || o.status === 'held';
const DONE_LIMIT = 8;

interface CardProps {
  o: Order;
  showProduct: boolean;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  action?: React.ReactNode;
}

function OrderCard({ o, showProduct, selected, onClick, onDoubleClick, action }: CardProps) {
  const product = resolveProduct(o);
  const pack = packSizeOf(o);
  const lowDpi = o.photos.filter((p) => !p.missing && p.dpi < 150).length;
  const missing = o.photos.filter((p) => p.missing).length;
  const warn = packWarning(o);
  const real = o.photos.filter((p) => !p.missing);
  const approved = real.filter((p) => p.approved).length;
  const n = sheetCount(o);
  return (
    <div
      className={`card bd-oc${selected ? ' sel' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="bd-r"><span className="oid">{o.id}</span></div>
      <div className="bd-r">
        {showProduct && product && <span className="pill neutral">{product.name}</span>}
        {pack && <span className="pill neutral">pack of {pack}</span>}
        {o.status === 'ready' && (
          <StatusPill status={o.status} extra={`${n} sheet${n > 1 ? 's' : ''}`} />
        )}
        {lowDpi > 0 && <span className="pill warn">{lowDpi} low DPI</span>}
        {missing > 0 && <span className="pill warn">{missing} missing</span>}
      </div>
      {warn && <div className="bd-warnline">{warn}</div>}
      <div className="bd-thumbs">
        {o.photos.slice(0, 6).map((p) =>
          p.missing ? (
            <span key={p.id} className="thumb missing" />
          ) : (
            <img key={p.id} className={`thumb${p.dpi < 150 ? ' lowdpi' : ''}`} src={blobUrl(p.cropBlob)} alt="" />
          )
        )}
        {o.photos.length > 6 && <span className="thumb more">+{o.photos.length - 6}</span>}
      </div>
      <div className="bd-foot">
        <span>
          {timeHM(o.importedAt)}
          {isReview(o) && real.length > 0 ? ` · ${approved} of ${real.length} approved` : ''}
        </span>
        {action}
      </div>
    </div>
  );
}

export function Board() {
  const orders = useStore((s) => s.orders);
  const importFiles = useStore((s) => s.importFiles);
  const buildBatch = useStore((s) => s.buildBatch);
  const markPrinted = useStore((s) => s.markPrinted);
  const failedImports = useStore((s) => s.failedImports);
  const retryFailed = useStore((s) => s.retryFailed);
  const dismissFailed = useStore((s) => s.dismissFailed);
  const duplicateImports = useStore((s) => s.duplicateImports);
  const replaceDuplicates = useStore((s) => s.replaceDuplicates);
  const dismissDuplicates = useStore((s) => s.dismissDuplicates);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showAllDone, setShowAllDone] = useState(false);

  const products = listProducts();
  const showProduct = filter === 'all';

  const cols = useMemo(() => {
    const inFilter = (o: Order) => {
      if (filter === 'all') return true;
      return resolveProduct(o)?.id === filter;
    };
    const mine = orders.filter(inFilter);
    const byImported = (a: Order, b: Order) => a.importedAt - b.importedAt;
    const byNewest = (a: Order, b: Order) => (b.printedAt ?? b.importedAt) - (a.printedAt ?? a.importedAt);
    return {
      unknown: orders.filter((o) => !resolveProduct(o)),
      review: mine.filter(isReview).sort(byImported),
      ready: mine.filter((o) => o.status === 'ready').sort(byImported),
      printed: mine.filter((o) => o.status === 'printed').sort(byNewest),
      done: mine.filter((o) => o.status === 'done').sort(byNewest),
    };
  }, [orders, filter]);

  // selection counts only orders still ready and visible
  const chosen = cols.ready.filter((o) => picked.has(orderKey(o)));
  const printSet = chosen.length > 0 ? chosen : cols.ready;
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; keys: string[] }>();
    for (const o of printSet) {
      const p = resolveProduct(o);
      if (!p) continue;
      const g = m.get(p.id) ?? { name: p.name, keys: [] };
      g.keys.push(orderKey(o));
      m.set(p.id, g);
    }
    return [...m.entries()];
  }, [printSet]);

  const print = (pid: string, keys: string[]) => {
    buildBatch(keys);
    setPicked(new Set());
    navigate(productPath(pid, 'print-batch'));
  };
  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const openPrint = (o: Order) => {
    const p = resolveProduct(o);
    if (p) navigate(productPath(p.id, `print/${encodeURIComponent(orderKey(o))}`));
  };
  const openReview = (o: Order) => {
    const p = resolveProduct(o);
    if (p) navigate(productPath(p.id, `review/${encodeURIComponent(orderKey(o))}`));
  };

  const doneShown = showAllDone ? cols.done : cols.done.slice(0, DONE_LIMIT);
  const doneMore = cols.done.length - doneShown.length;

  return (
    <div
      className="main bd-board"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="bd-chips">
        <button className={`bd-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
          All products
        </button>
        {products.map((p) => {
          const n = orders.filter((o) => resolveProduct(o)?.id === p.id && isOpen(o)).length;
          return (
            <button key={p.id} className={`bd-chip${filter === p.id ? ' on' : ''}`} onClick={() => setFilter(p.id)}>
              {p.name} · {n}
            </button>
          );
        })}
      </div>

      <div className="bd-cols">
        <section className="bd-col bd-inbox">
          <div className="bd-ch">Inbox</div>
          <div className="bd-scroll">
            <ImportDrop compact />
            {failedImports.length > 0 && (
              <div className="banner-error bd-note">
                <div className="t">
                  {failedImports.length} zip{failedImports.length > 1 ? 's' : ''} could not be read
                </div>
                {failedImports.map((f) => (
                  <div key={f.fileName} className="row">
                    {f.fileName} <span style={{ color: 'var(--ink-muted)' }}>{f.message}</span>
                  </div>
                ))}
                <div className="actions">
                  <button className="btn sm" onClick={() => void retryFailed()}>Retry</button>
                  <button className="btn sm" onClick={dismissFailed}>Dismiss</button>
                </div>
              </div>
            )}
            {duplicateImports.length > 0 && (
              <div className="banner-warn bd-note">
                <div className="t">
                  {duplicateImports.length} zip{duplicateImports.length > 1 ? 's' : ''} already in the queue; kept the
                  existing version
                </div>
                {duplicateImports.map((d) => (
                  <div key={d.fileName} className="row">
                    {d.fileName} <span style={{ color: 'var(--ink-muted)' }}>
                      is {d.existingStatus.replace('_', ' ')}; replacing discards its review work
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
            {cols.unknown.map((o) => (
              <div key={orderKey(o)} className="card bd-oc">
                <div className="bd-r"><span className="oid">{o.id}</span></div>
                <div className="bd-r"><span className="pill warn">Unknown product</span></div>
                <button className="btn sm" onClick={() => navigate('/unassigned')}>Choose product</button>
              </div>
            ))}
          </div>
        </section>

        <section className="bd-col">
          <div className="bd-ch">To review <span className="bd-n">{cols.review.length}</span></div>
          <div className="bd-scroll">
            {orders.length === 0 && (
              <div className="bd-hint">
                No orders yet. Drop Amazon order zips into the Inbox on the left, or use Import zips above. Orders
                appear here once they are read.
              </div>
            )}
            {cols.review.map((o) => (
              <OrderCard key={orderKey(o)} o={o} showProduct={showProduct} onClick={() => openReview(o)} />
            ))}
          </div>
        </section>

        <section className="bd-col">
          <div className="bd-ch">
            Ready to print <span className="bd-n">{cols.ready.length}</span>
            <span className="bd-sp" />
            {groups.length === 1 && (
              <button
                className="btn sm primary"
                onClick={() => print(groups[0][0], groups[0][1].keys)}
              >
                {chosen.length > 0 ? `Print ${chosen.length} selected` : 'Print all'}
              </button>
            )}
          </div>
          {groups.length > 1 && (
            <div className="bd-printgroups">
              {groups.map(([pid, g]) => (
                <button key={pid} className="btn sm primary" onClick={() => print(pid, g.keys)}>
                  Print {g.name} ({g.keys.length})
                </button>
              ))}
            </div>
          )}
          <div className="bd-scroll">
            {cols.ready.map((o) => (
              <OrderCard
                key={orderKey(o)}
                o={o}
                showProduct={showProduct}
                selected={picked.has(orderKey(o))}
                onClick={() => toggle(orderKey(o))}
                onDoubleClick={() => openPrint(o)}
              />
            ))}
          </div>
        </section>

        <section className="bd-col">
          <div className="bd-ch">Printed <span className="bd-n">{cols.printed.length}</span></div>
          <div className="bd-scroll">
            {cols.printed.map((o) => (
              <OrderCard
                key={orderKey(o)}
                o={o}
                showProduct={showProduct}
                onClick={() => openPrint(o)}
                action={
                  <button
                    className="btn sm"
                    title="Cut, laminated and packed"
                    onClick={(e) => {
                      e.stopPropagation();
                      markPrinted([orderKey(o)], true);
                    }}
                  >
                    Mark done
                  </button>
                }
              />
            ))}
          </div>
        </section>

        <section className="bd-col">
          <div className="bd-ch">Done <span className="bd-n">{cols.done.length}</span></div>
          <div className="bd-scroll">
            {doneShown.map((o) => (
              <OrderCard key={orderKey(o)} o={o} showProduct={showProduct} onClick={() => openPrint(o)} />
            ))}
            {doneMore > 0 && (
              <button className="bd-more" onClick={() => setShowAllDone(true)}>+ {doneMore} more</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
