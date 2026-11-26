import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { listProducts, productPath, resolveProduct } from '../products';
import { ImportButton, ThemeToggle } from './common';
import { LayoutSwitch } from './LayoutSwitch';

/** Shell header for the Board and Focus layouts (Pipeline uses the Sidebar instead). */
export function TopBar() {
  const orders = useStore((s) => s.orders);
  const customProducts = useStore((s) => s.customProducts);
  // customProducts is read so the list re-renders when one is added or deleted
  const products = useMemo(() => listProducts(), [customProducts]);
  const unassigned = orders.filter((o) => !resolveProduct(o)).length;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo">
        <span className="logo-mark">T</span>
        <span>Thiiroo</span>
      </Link>
      <span style={{ flex: 1 }} />
      {unassigned > 0 && (
        <Link to="/unassigned" className="pill attention">{unassigned} unassigned</Link>
      )}
      <div className="topbar-menu">
        <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Setup ▾</button>
        {open && (
          <div className="topbar-pop card">
            <div className="section-label">Orders by product</div>
            {products.map((p) => (
              <Link key={p.id} to={productPath(p.id, 'queue')}>{p.name}</Link>
            ))}
            <div className="section-label">Templates</div>
            {products.map((p) => (
              <Link key={p.id} to={productPath(p.id, 'template')}>{p.name}</Link>
            ))}
            <Link to="/add-product">+ Add product</Link>
            <div className="section-label">Tools</div>
            <Link to="/crop-export">Crop export</Link>
            <div className="section-label">Appearance</div>
            <ThemeToggle />
          </div>
        )}
      </div>
      <LayoutSwitch />
      <ImportButton />
    </header>
  );
}
