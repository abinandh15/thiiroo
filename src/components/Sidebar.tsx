import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { PRODUCTS } from '../products';

export function Sidebar() {
  const orders = useStore((s) => s.orders);
  const location = useLocation();
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
      {PRODUCTS.map((p) => {
        const inProduct = location.pathname.startsWith(`/p/${p.id}`);
        return (
          <div key={p.id}>
            <NavLink to={`/p/${p.id}/queue`} className={`side-row${inProduct ? ' active' : ''}`}>
              <span>
                {p.name}
                <span className="count" style={{ display: 'block', marginLeft: 0, textAlign: 'left' }}>
                  {p.asin} · {p.sizeLabel}
                </span>
              </span>
            </NavLink>
            {inProduct && (
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
      <button className="side-ghost" title="A second listing plugs in as a new product module">+ Add product</button>

      <div className="side-amazon">
        <div className="t"><span className="dot" />Amazon — not connected</div>
        <div className="s">Manual zip import · SP-API in Phase 3</div>
      </div>
    </nav>
  );
}
