import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { BUILTIN_PRODUCTS } from '../products';

type AmazonStatus =
  | { state: 'offline' } // backend not running — manual import only
  | { state: 'setup' | 'authorize' | 'error'; detail?: string; error?: string }
  | { state: 'connected'; marketplaces: string[] };

/** Poll the Phase 3 backend's /api/status; offline (no backend) is a normal state, not an error. */
function useAmazonStatus(): AmazonStatus {
  const [status, setStatus] = useState<AmazonStatus>({ state: 'offline' });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (alive) setStatus(body.state ? body : { state: 'offline' });
      } catch {
        if (alive) setStatus({ state: 'offline' });
      }
    };
    void check();
    const t = setInterval(check, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return status;
}

const AMAZON_CARD: Record<AmazonStatus['state'], { t: string; s: string; cls: string }> = {
  offline: { t: 'Amazon — not connected', s: 'Manual zip import · start the backend with npm run server', cls: '' },
  setup: { t: 'Amazon — setup needed', s: 'LWA credentials missing in .env', cls: 'warn' },
  authorize: { t: 'Amazon — authorize app', s: 'Refresh token missing — self-authorize in Developer Central', cls: 'warn' },
  error: { t: 'Amazon — connection error', s: '', cls: 'warn' },
  connected: { t: 'Amazon connected', s: '', cls: 'ok' },
};

function AmazonCard() {
  const status = useAmazonStatus();
  const card = AMAZON_CARD[status.state];
  const sub =
    status.state === 'connected'
      ? `SP-API · ${status.marketplaces.length} marketplace${status.marketplaces.length !== 1 ? 's' : ''} · orders inbox soon`
      : status.state === 'error'
        ? status.error ?? 'backend reachable but SP-API call failed'
        : card.s;
  return (
    <div className={`side-amazon ${card.cls}`}>
      <div className="t"><span className="dot" />{card.t}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

export function Sidebar() {
  const orders = useStore((s) => s.orders);
  const location = useLocation();
  const customProducts = useStore((s) => s.customProducts);
  const products = [...BUILTIN_PRODUCTS, ...customProducts];
  const open = orders.filter((o) => o.status !== 'printed' && o.status !== 'done');
  const review = orders.filter((o) => o.status === 'needs_review' || o.status === 'held');

  const link = (to: string, label: string, opts?: { count?: number; warn?: boolean; end?: boolean }) => (
    <NavLink to={to} end={opts?.end} className={({ isActive }) => `side-row${isActive ? ' active' : ''}`}>
      <span>{label}</span>
      {opts?.count !== undefined && opts.count > 0 && (
        <span className={`count${opts.warn ? ' warn' : ''}`}>{opts.count}</span>
      )}
    </NavLink>
  );

  return (
    <nav className="sidebar">
      <div className="logo">
        <div className="logo-mark">T</div>
        <div className="logo-name">Thiiroo</div>
        <div className="logo-ver">v0.1</div>
      </div>

      <div className="side-label">Workspace</div>
      {link('/', 'Overview', { end: true })}

      <div className="side-label">Products</div>
      {products.map((p) => {
        const inProduct = location.pathname.startsWith(`/p/${p.id}`);
        return (
          <div key={p.id}>
            <NavLink to={`/p/${p.id}/${p.custom ? 'template' : 'queue'}`} className={`side-row${inProduct ? ' active' : ''}`}>
              <span>
                {p.name}
                <span className="count" style={{ display: 'block', marginLeft: 0, textAlign: 'left' }}>
                  {[p.asin, p.sizeLabel].filter(Boolean).join(' · ')}
                </span>
              </span>
            </NavLink>
            {inProduct && !p.custom && (
              <div className="side-sub">
                {link(`/p/${p.id}/queue`, 'Queue', { count: open.length })}
                {link(`/p/${p.id}/review`, 'Review', { count: review.length, warn: true })}
                {link(`/p/${p.id}/print-batch`, 'Print', {})}
                {link(`/p/${p.id}/template`, 'Template', {})}
              </div>
            )}
          </div>
        );
      })}
      <NavLink to="/add-product" className={({ isActive }) => `side-ghost${isActive ? ' active' : ''}`}>
        + Add product
      </NavLink>

      <div className="side-label">Tools</div>
      {link('/crop-export', 'Crop export')}

      <AmazonCard />
    </nav>
  );
}
