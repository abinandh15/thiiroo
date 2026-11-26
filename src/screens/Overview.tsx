import { Link, useNavigate } from 'react-router-dom';
import { orderKey, sheetCount, useStore } from '../store';
import { listProducts, productPath, resolveProduct } from '../products';
import { headerStamp, timeHM } from '../lib/format';
import { ImportButton, StatusPill, ThemeToggle } from '../components/common';
import { blobUrl } from '../lib/format';

const ACTIVITY_COLS = '160px 170px minmax(0, 1fr) 60px 130px 60px';

export function Overview() {
  const orders = useStore((s) => s.orders);
  const activity = useStore((s) => s.activity);
  const navigate = useNavigate();
  const customProducts = useStore((s) => s.customProducts);
  const products = listProducts(); // re-evaluated when customProducts changes
  void customProducts;
  const unassigned = orders.filter((o) => !resolveProduct(o)).length;
  const firstQueue = productPath(products[0].id, 'queue');

  // activity rows only carry the order ID: look the order up to name its product and open it
  const orderOf = (orderId: string) => orders.find((o) => o.id === orderId);
  const openOrder = (orderId: string) => {
    const o = orderOf(orderId);
    if (!o) return;
    const p = resolveProduct(o);
    if (!p) return navigate('/unassigned');
    const step = o.status === 'needs_review' || o.status === 'held' ? 'review' : 'print';
    navigate(productPath(p.id, `${step}/${encodeURIComponent(orderKey(o))}`));
  };

  const inQueue = orders.filter((o) => o.status !== 'printed' && o.status !== 'done');
  const needsReview = orders.filter((o) => o.status === 'needs_review');
  const ready = orders.filter((o) => o.status === 'ready');
  const today = new Date().setHours(0, 0, 0, 0);
  const printedToday = orders.filter((o) => o.printedAt && o.printedAt >= today);

  const lowDpi = needsReview.reduce(
    (n, o) => n + o.photos.filter((p) => !p.missing && p.dpi < 150).length, 0);
  const missing = needsReview.reduce((n, o) => n + o.photos.filter((p) => p.missing).length, 0);
  const readySheets = ready.reduce((n, o) => n + sheetCount(o), 0);
  const printedPrints = printedToday.reduce((n, o) => n + o.photos.filter((p) => !p.missing).length * o.qty, 0);
  const printedSheets = printedToday.reduce((n, o) => n + sheetCount(o), 0);


  return (
    <div className="main">
      <header className="header">
        <span className="title">Overview</span>
        <span className="stamp">{headerStamp()}</span>
        <span className="spacer" />
        <ThemeToggle />
        <ImportButton />
      </header>
      <div className="content">
        {unassigned > 0 && (
          <div className="banner-warn" style={{ margin: 0 }}>
            <div className="t">
              {unassigned} order{unassigned > 1 ? 's' : ''} with an unknown ASIN {unassigned > 1 ? 'are' : 'is'} waiting
              for a template —{' '}
              <Link to="/unassigned">Assign template →</Link>
            </div>
          </div>
        )}
        <div className="stats">
          <div className="card stat">
            <div className="section-label">In queue</div>
            <div className="v">{inQueue.length}</div>
            <div className="s">{inQueue.reduce((n, o) => n + o.photos.length, 0)} photos</div>
          </div>
          <div className={`card stat${needsReview.length ? ' attention' : ''}`}>
            <div className="section-label" style={needsReview.length ? { color: 'var(--attention-text)' } : undefined}>
              Needs review
            </div>
            <div className="v">{needsReview.length}</div>
            <div className="s">
              {lowDpi} low-DPI · {missing} missing file{missing !== 1 ? 's' : ''}
            </div>
          </div>
          <div className={`card stat${ready.length ? ' ready' : ''}`}>
            <div className="section-label" style={ready.length ? { color: 'var(--ready-text)' } : undefined}>
              Ready to print
            </div>
            <div className="v">{ready.length}</div>
            <div className="s">{readySheets} A4 sheet{readySheets !== 1 ? 's' : ''}</div>
          </div>
          <div className="card stat">
            <div className="section-label">Printed today</div>
            <div className="v">{printedToday.length}</div>
            <div className="s">{printedPrints} prints · {printedSheets} sheets</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
          <div className="card">
            <div className="card-pad" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <span className="card-title">Recent activity</span>
              <span style={{ flex: 1 }} />
              <Link to={firstQueue} style={{ fontSize: 11.5 }}>
                Open queue →
              </Link>
            </div>
            {activity.length === 0 ? (
              <div className="state-card">
                <div className="fanned">
                  <div className="pol"><i /></div>
                  <div className="pol"><i /></div>
                  <div className="pol"><i /></div>
                </div>
                <div className="h">No orders in the queue</div>
                <div className="b">
                  Download customization zips from Seller Central → Manage Orders → Customization Info, then import
                  them here. Everything is processed on this machine — nothing is uploaded.
                </div>
                <div className="actions">
                  <ImportButton className="btn primary" />
                </div>
              </div>
            ) : (
              <>
                <div className="table-head" style={{ gridTemplateColumns: ACTIVITY_COLS }}>
                  <span>Order</span><span>Product</span><span>Event</span><span>Photos</span><span>Status</span><span>Time</span>
                </div>
                {activity.slice(0, 12).map((ev, i) => {
                  const o = orderOf(ev.orderId);
                  const p = o ? resolveProduct(o) : undefined;
                  return (
                  <div
                    key={i}
                    className={`table-row${o ? ' clickable' : ''}`}
                    style={{ gridTemplateColumns: ACTIVITY_COLS }}
                    title={o ? (p ? `Open this order in ${p.name}` : 'Choose a product for this order') : 'This order was removed'}
                    onClick={() => openOrder(ev.orderId)}
                  >
                    <span className="oid">{ev.orderId}</span>
                    <span>
                      {!o ? <span className="faint">removed</span>
                        : p ? <span className="pill neutral">{p.name}</span>
                        : <span className="pill warn">Unassigned</span>}
                    </span>
                    <span className="ev-text" title={ev.event}>{ev.event}</span>
                    <span className="mono">{ev.photos}</span>
                    <span><StatusPill status={ev.status} /></span>
                    <span className="mono faint">{timeHM(ev.at)}</span>
                  </div>
                  );
                })}
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 10 }}>Products</div>
              {products.map((p) => {
                const mine = orders.filter((o) => resolveProduct(o)?.id === p.id);
                const open = mine.filter((o) => o.status !== 'printed' && o.status !== 'done').length;
                const thumb = mine.find((o) => o.photos[0] && blobUrl(o.photos[0].cropBlob))?.photos[0];
                return (
                  <div
                    key={p.id}
                    className="card card-pad"
                    style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}
                    onClick={() => navigate(productPath(p.id, 'queue'))}
                  >
                    <div style={{ width: 34, height: 44, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '3px 3px 9px', flexShrink: 0 }}>
                      {thumb ? (
                        <img src={blobUrl(thumb.cropBlob)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--bg-stage)' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {p.sizeLabel ? `${p.sizeLabel} · ` : ''}{open} open order{open !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="btn" style={{ width: '100%', marginTop: 10, borderStyle: 'dashed', color: 'var(--ink-faint)' }}>
                + Add product workflow
              </button>
            </div>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 6 }}>Amazon connection</div>
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                Not connected. Orders arrive by manual zip import. SP-API sync (auto-pull open customization orders,
                mark shipped) lands in Phase 3.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
