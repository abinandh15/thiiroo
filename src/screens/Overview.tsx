import { Link, useNavigate } from 'react-router-dom';
import { sheetCount, useStore } from '../store';
import { headerStamp, timeHM } from '../lib/format';
import { ImportButton, StatusPill, ThemeToggle } from '../components/common';
import { blobUrl } from '../lib/format';

export function Overview() {
  const orders = useStore((s) => s.orders);
  const activity = useStore((s) => s.activity);
  const navigate = useNavigate();

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

  const firstProduct = orders[0];

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
              <Link to="/p/instant-photo-prints/queue" style={{ fontSize: 11.5 }}>
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
                <div className="table-head" style={{ gridTemplateColumns: '150px 1fr 60px 120px 60px' }}>
                  <span>Order</span><span>Event</span><span>Photos</span><span>Status</span><span>Time</span>
                </div>
                {activity.slice(0, 12).map((ev, i) => (
                  <div key={i} className="table-row" style={{ gridTemplateColumns: '150px 1fr 60px 120px 60px' }}>
                    <span className="oid">{ev.orderId}</span>
                    <span>{ev.event}</span>
                    <span className="mono">{ev.photos}</span>
                    <span><StatusPill status={ev.status} /></span>
                    <span className="mono faint">{timeHM(ev.at)}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 10 }}>Products</div>
              <div
                className="card card-pad"
                style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}
                onClick={() => navigate('/p/instant-photo-prints/queue')}
              >
                <div style={{ width: 34, height: 44, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '3px 3px 9px' }}>
                  {firstProduct?.photos[0] && blobUrl(firstProduct.photos[0].cropBlob) ? (
                    <img src={blobUrl(firstProduct.photos[0].cropBlob)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--bg-stage)' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>Instant Photo Prints</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    4×3 in · 6-up A4 · {inQueue.length} open order{inQueue.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
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
