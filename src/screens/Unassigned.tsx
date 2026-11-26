import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { effectiveTemplate, orderKey, useStore } from '../store';
import { listProducts, productPath, resolveProduct } from '../products';
import { slotsPerSheet } from '../lib/geometry';
import { blobUrl, truncateMiddle } from '../lib/format';
import { ThemeToggle } from '../components/common';

/** Orders whose ASIN matches no product and that nobody has assigned yet. */
export function Unassigned() {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const customProducts = useStore((s) => s.customProducts);
  const assignProduct = useStore((s) => s.assignProduct);
  const removeOrder = useStore((s) => s.removeOrder);
  // slots per sheet of every product; a joined string keeps the selector's result stable
  const slotsKey = useStore((s) => listProducts().map((p) => slotsPerSheet(effectiveTemplate(s, p.id))).join(','));

  const products = listProducts(); // re-evaluated when customProducts changes
  void customProducts;
  const slots = slotsKey.split(',').map(Number);

  const list = orders.filter((o) => !resolveProduct(o)).sort((a, b) => a.importedAt - b.importedAt);
  // everything is selected unless unticked, so orders that arrive later join the selection
  const [off, setOff] = useState<Set<string>>(new Set());
  const [productId, setProductId] = useState('');
  const [remember, setRemember] = useState(true);

  const chosenId = products.some((p) => p.id === productId) ? productId : products[0]?.id;
  const selected = list.filter((o) => !off.has(orderKey(o)));
  const first = selected[0];

  const toggle = (k: string) => {
    const next = new Set(off);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOff(next);
  };

  const newTemplate = () => {
    if (!first) return;
    const q = new URLSearchParams();
    if (first.asin) q.set('asin', first.asin);
    q.set('pack', String(first.photos.length));
    navigate(`/add-product?${q.toString()}`);
  };

  return (
    <div className="main">
      <header className="header">
        <span className="title">Unassigned</span>
        <span className="crumb">/ orders waiting for a template</span>
        <span className="spacer" />
        <ThemeToggle />
      </header>

      {list.length === 0 ? (
        <div className="content">
          <div className="card state-card">
            <div className="h">Nothing is waiting — every order matched a product.</div>
            <div className="b">Orders land here when their ASIN is not in any product and no template was picked by hand.</div>
            <div className="actions">
              <button className="btn primary" onClick={() => navigate(productPath(products[0].id, 'queue'))}>
                Open queue
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="queue-body">
          <div className="queue-table-col">
            <div className="queue-scroll">
              {list.map((o) => {
                const k = orderKey(o);
                const on = !off.has(k);
                return (
                  <div key={k} className={`urow${on ? ' selected' : ''}`} onClick={() => toggle(k)}>
                    <input type="checkbox" checked={on} readOnly />
                    <span className="oid">{o.id}</span>
                    <span>
                      <div>
                        Item <span className="mono">{o.itemId}</span>{' '}
                        <span className="faint mono">
                          · ASIN {o.asin || 'unknown'} · {o.photos.length} buyer JPG{o.photos.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {o.title && <div className="muted" style={{ fontSize: 11 }}>{truncateMiddle(o.title, 60)}</div>}
                    </span>
                    <span className="thumbstrip">
                      {o.photos.map((p) =>
                        p.missing ? (
                          <span key={p.id} className="thumb missing" />
                        ) : (
                          <img key={p.id} className="thumb" src={blobUrl(p.cropBlob)} alt="" />
                        )
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="batch-panel">
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>Print with</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {products.map((p, i) => (
                  <div
                    key={p.id}
                    className={`radio-card${p.id === chosenId ? ' on' : ''}`}
                    onClick={() => setProductId(p.id)}
                  >
                    <span className="r" />
                    <span>
                      <div className="t">{p.name}{p.sizeLabel ? ` · ${p.sizeLabel}` : ''}</div>
                      <div className="s">{slots[i]} per sheet</div>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <label className="addp-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember these ASINs for this product</span>
            </label>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.55, marginTop: -6 }}>
              Future orders with the same ASIN will route to this product automatically.
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn primary"
                disabled={selected.length === 0 || !chosenId}
                onClick={() => {
                  if (!chosenId) return;
                  assignProduct(selected.map(orderKey), chosenId, remember);
                  navigate(productPath(chosenId, 'queue'));
                }}
              >
                Assign {selected.length} order{selected.length !== 1 ? 's' : ''}
              </button>
              <button className="btn" disabled={!first} onClick={newTemplate}>New template from SVG…</button>
              <button
                className="btn"
                disabled={selected.length === 0}
                title="Delete the selected orders and their activity history"
                onClick={() => {
                  const n = selected.length;
                  const ok = window.confirm(
                    `Remove ${n} order${n > 1 ? 's' : ''} from the dashboard?\n\n` +
                      'Photos, review work and activity history are discarded. ' +
                      'Re-importing the zip brings the order back as new.'
                  );
                  if (!ok) return;
                  for (const o of selected) removeOrder(orderKey(o));
                }}
              >
                Remove…
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
