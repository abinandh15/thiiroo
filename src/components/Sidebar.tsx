import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store';

const PRODUCT = { id: 'instant-photo-prints', name: 'Instant Photo Prints', asin: 'B0HB4CYFG3', size: '4×3in' };

export function Sidebar() {
  const orders = useStore((s) => s.orders);
  const location = useLocation();
  const open = orders.filter((o) => o.status !== 'printed' && o.status !== 'done');
  const review = orders.filter((o) => o.status === 'needs_review' || o.status === 'held');
  const inProduct = location.pathname.startsWith(`/p/${PRODUCT.id}`);

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
      <NavLink
        to={`/p/${PRODUCT.id}/queue`}
        className={`side-row${inProduct ? ' active' : ''}`}
      >
        <span>
          {PRODUCT.name}
          <span className="count" style={{ display: 'block', marginLeft: 0, textAlign: 'left' }}>
            {PRODUCT.asin} · {PRODUCT.size}
          </span>
        </span>
      </NavLink>
      {inProduct && (
        <div className="side-sub">
          {link(`/p/${PRODUCT.id}/queue`, 'Queue', { count: open.length })}
          {link(`/p/${PRODUCT.id}/review`, 'Review', { count: review.length, warn: true })}
          {link(`/p/${PRODUCT.id}/print-batch`, 'Print', {})}
          {link(`/p/${PRODUCT.id}/template`, 'Template', {})}
        </div>
      )}
      <button className="side-ghost" title="Phase 2">+ Add product</button>

      <div className="side-amazon">
        <div className="t"><span className="dot" />Amazon — not connected</div>
        <div className="s">Manual zip import · SP-API in Phase 3</div>
      </div>
    </nav>
  );
}
