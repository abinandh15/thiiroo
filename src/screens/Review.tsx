import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useHome } from '../lib/useHome';
import { allApproved, orderKey, sheetsPerCopy, useStore } from '../store';
import { listProducts, packSizeOf, packWarning, productPath, resolveProduct } from '../products';
import type { Product } from '../products';
import type { TemplateDescriptor } from '../lib/geometry';
import { aspectWarning, useProductOrders, useProductTemplate, useRouteProduct } from '../products/useRouteProduct';
import type { Order, Photo, Placement } from '../lib/types';
import { blobUrl, truncateMiddle } from '../lib/format';
import { DPI_FLOOR, photoFrame, slotsPerSheet } from '../lib/geometry';
import { StatusPill, ThemeToggle } from '../components/common';
import '../styles/review.css';
import { downloadOrderCrops, downloadPhotoCrop } from '../lib/cropDownload';
import { CropControls, CropFrame, FRAME_H, FRAME_W, reframeKey, useReframe } from '../components/CropEditor';

const fmtMm = (v: number) => String(Math.round(v * 10) / 10);
const BUYER_PX = 190; // buyer 400x400 snapshot, shown as a small reference
const CROP_PX = () => (window.innerHeight >= 860 ? 400 : window.innerHeight >= 760 ? 340 : FRAME_W); // crop frame width

export function Review() {
  const { key: rawKey } = useParams();
  const product = useRouteProduct();
  const homeNav = useHome(product.id);
  const allOrders = useStore((s) => s.orders);
  const orders = useProductOrders(product);
  const template = useProductTemplate(product);
  const navigate = useNavigate();

  const reviewables = useMemo(
    () => orders.filter((o) => o.status === 'needs_review' || o.status === 'held'),
    [orders]
  );
  const key = rawKey ? decodeURIComponent(rawKey) : reviewables[0] ? orderKey(reviewables[0]) : undefined;
  const order = orders.find((o) => orderKey(o) === key);

  // the URL names an order that belongs to another template (or to none): follow it there
  const elsewhere = rawKey ? allOrders.find((o) => orderKey(o) === key) : undefined;
  if (!order && elsewhere) {
    const home = resolveProduct(elsewhere);
    return home ? (
      <Navigate replace to={productPath(home.id, `review/${encodeURIComponent(orderKey(elsewhere))}`)} />
    ) : (
      <Navigate replace to="/unassigned" />
    );
  }

  if (!order) {
    return (
      <div className="main">
        <header className="header">
          <a onClick={() => navigate(homeNav.path)} style={{ cursor: 'pointer' }}>← {homeNav.label}</a>
          <span className="title">Review</span>
          <span className="spacer" />
          <ThemeToggle />
        </header>
        <div className="content">
          <div className="card state-card">
            <div className="h">Nothing needs review</div>
            <div className="b">Every imported order has been approved. Import more zips or build a print batch from the queue.</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <ReviewInner key={orderKey(order)} order={order} reviewables={reviewables} product={product} template={template} />
  );
}

function reviewReason(o: Order): { text: string; ok: boolean } {
  const low = o.photos.filter((p) => !p.missing && p.dpi < DPI_FLOOR).length;
  const missing = o.photos.filter((p) => p.missing).length;
  if (missing) return { text: `${missing} missing file · ${o.photos.length} photos`, ok: false };
  if (low) return { text: `${low} low DPI · ${o.photos.length} photos`, ok: false };
  return { text: `Not yet reviewed · ${o.photos.length} photos`, ok: true };
}

function ReviewInner({
  order,
  reviewables,
  product,
  template,
}: {
  order: Order;
  reviewables: Order[];
  product: Product;
  template: TemplateDescriptor;
}) {
  const k = orderKey(order);
  const homeNav = useHome(product.id);
  const frame = useMemo(() => photoFrame(template), [template]);
  const slots = slotsPerSheet(template);
  const aspectWarn = aspectWarning(order, template);
  const navigate = useNavigate();
  const updatePhoto = useStore((s) => s.updatePhoto);
  const approveAll = useStore((s) => s.approveAll);
  const reframePhoto = useStore((s) => s.reframePhoto);
  const setStatus = useStore((s) => s.setStatus);
  const assignProduct = useStore((s) => s.assignProduct);
  const products = listProducts();

  const [idx, setIdx] = useState(0);
  const photo: Photo | undefined = order.photos[idx];

  const onReframe = useCallback(
    (p: Photo, placement: Placement | undefined) => void reframePhoto(k, p.id, placement),
    [k, reframePhoto]
  );
  const frameW = useMemo(CROP_PX, []);
  const rf = useReframe(photo, onReframe, frame, frameW);
  const { eff, dpi } = rf;

  const nextReviewable = reviewables.find((o) => orderKey(o) !== k);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (reframeKey(e, rf)) return;
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, order.photos.length - 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
      else if (e.key === 'a' || e.key === 'A') {
        if (e.shiftKey) approveAll(k);
        else if (photo && !photo.missing) updatePhoto(k, photo.id, { approved: true, flagged: false });
      } else if (e.key === 'Escape') navigate(homeNav.path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const approvedCount = order.photos.filter((p) => p.approved || p.missing).length;
  const kCanvas = BUYER_PX / 400;
  const frameH = Math.round((frameW * FRAME_H) / FRAME_W);
  const lowDpi = !!photo && !photo.missing && dpi < DPI_FLOOR;
  const pack = packSizeOf(order);
  const packWarn = packWarning(order);
  const otherLow = order.photos.filter((p, i) => i !== idx && !p.missing && p.dpi < DPI_FLOOR).length;
  const missingCount = order.photos.filter((p) => p.missing).length;
  const angle = eff ? (eff.angle > 180 ? eff.angle - 360 : eff.angle) : 0;

  const approveAllAndGo = () => {
    approveAll(k);
    if (nextReviewable) navigate(productPath(product.id, `review/${encodeURIComponent(orderKey(nextReviewable))}`));
    else navigate(homeNav.path);
  };

  return (
    <div className="main rv">
      <header className="header">
        <a onClick={() => navigate(homeNav.path)} style={{ cursor: 'pointer' }}>← {homeNav.label}</a>
        <span className="title mono">{order.id}</span>
        <StatusPill status={order.status} />
        <span className="crumb">Photo {idx + 1} of {order.photos.length}</span>
        <span className="spacer" />
        {products.length > 1 && (
          <label className="rv-template" title="Print this order with another product's template. Approvals are cleared and DPI is re-judged.">
            Template
            <select
              value={product.id}
              onChange={(e) => {
                const id = e.target.value;
                if (id === product.id) return;
                const cleared = order.photos.some((p) => p.approved);
                if (cleared && !window.confirm("Switching the template clears this order's photo approvals. Continue?")) return;
                assignProduct([k], id, false);
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
        <span className="rv-keys" tabIndex={0}>
          Shortcuts
          <span className="rv-keys-pop card">
            {SHORTCUTS.map(([keys, what]) => (
              <span key={keys} className="rv-key-row"><kbd>{keys}</kbd>{what}</span>
            ))}
          </span>
        </span>
        <button
          className="btn"
          title="Save every photo of this order as a JPEG, cropped as positioned and trimmed to this template's frame (.zip)"
          onClick={() => void downloadOrderCrops([order], template)}
        >
          Download crops
        </button>
        <button className="btn" onClick={() => setStatus(k, order.status === 'held' ? 'needs_review' : 'held')}>
          {order.status === 'held' ? 'Release hold' : 'Hold order'}
        </button>
        <button className="btn dark" onClick={approveAllAndGo} title="Approve every photo and open the next order">
          Approve all {order.photos.length} <kbd>⇧A</kbd>
        </button>
      </header>

      <div className="review-body">
        <aside className="review-rail rv-rail">
          <div className="rail-head section-label">To review · {reviewables.length}</div>
          {reviewables.map((o) => {
            const reason = reviewReason(o);
            const first = o.photos.find((p) => !p.missing);
            return (
              <div
                key={orderKey(o)}
                className={`item${orderKey(o) === k ? ' active' : ''}`}
                onClick={() => navigate(productPath(product.id, `review/${encodeURIComponent(orderKey(o))}`))}
              >
                {first ? <img className="thumb" src={blobUrl(first.cropBlob)} alt="" /> : <span className="thumb missing" />}
                <div style={{ minWidth: 0 }}>
                  <div className="id">{o.id}</div>
                  <div className={`why${reason.ok ? ' ok' : ''}`}>{reason.text}</div>
                </div>
              </div>
            );
          })}
        </aside>

        <div className="stage-col">
          <div className="stage rv-stage">
            <div className="rv-work">
              {/* buyer preview: small reference, not a second canvas */}
              <div className="card rv-buyer">
                <div className="section-label">Buyer's preview</div>
                <div className="buyer-canvas" style={{ width: BUYER_PX, height: BUYER_PX }}>
                  {blobUrl(order.snapshotBlob) ? (
                    <img src={blobUrl(order.snapshotBlob)} style={{ width: '100%', height: '100%', display: 'block' }} alt="Buyer snapshot" />
                  ) : (
                    <div className="rv-nosnap faint">no snapshot in zip</div>
                  )}
                  {photo && (
                    <div
                      style={{
                        position: 'absolute',
                        left: photo.crop.x * kCanvas,
                        top: photo.crop.y * kCanvas,
                        width: photo.crop.w * kCanvas,
                        height: photo.crop.h * kCanvas,
                        border: '1.5px solid var(--accent)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
                <div className="rv-buyer-note muted">What the buyer saw when ordering. The blue outline is the print area.</div>
              </div>

              {/* our crop */}
              <div className="rv-crop">
                {photo?.missing ? (
                  <div className="crop-frame rv-missing" style={{ width: frameW, height: frameH }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--attention-text)' }}>Image not in zip</div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        The order references <span className="mono">{truncateMiddle(photo.imageName)}</span> but the zip
                        does not contain it. Print will skip this slot.
                      </div>
                    </div>
                  </div>
                ) : (
                  photo && eff && <CropFrame photo={photo} r={rf} />
                )}
                {photo && <CropControls photo={photo} r={rf} />}
              </div>
            </div>

            {photo && !photo.missing && (
              <div className="rv-actions">
                <button className="btn" title="Save this photo as a JPEG, cropped as positioned and trimmed to this template's frame" onClick={() => void downloadPhotoCrop(photo, idx, template)}>
                  Download
                </button>
                <button className="btn" onClick={() => updatePhoto(k, photo.id, { flagged: !photo.flagged, approved: false })}>
                  {photo.flagged ? 'Unflag photo' : 'Flag photo'}
                </button>
                <button
                  className="btn primary rv-approve"
                  onClick={() => {
                    updatePhoto(k, photo.id, { approved: true, flagged: false });
                    setIdx((i) => Math.min(i + 1, order.photos.length - 1));
                  }}
                >
                  {photo.approved ? 'Approved · next photo' : 'Approve photo'} <kbd>A</kbd>
                </button>
              </div>
            )}
          </div>

          <div className="filmstrip">
            {order.photos.map((p, i) => (
              <div key={p.id} className={`fthumb${i === idx ? ' current' : ''}${p.missing ? ' empty' : ''}`} onClick={() => setIdx(i)}>
                {p.missing ? (
                  <span>missing<br />file</span>
                ) : (
                  <>
                    <img src={blobUrl(p.cropBlob)} alt="" />
                    {p.approved ? <span className="st ok">✓</span> : p.flagged ? <span className="st warn">!</span> : null}
                  </>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, slots - order.photos.length) }, (_, i) => (
              <div key={`e${i}`} className="fthumb empty">empty<br />slot</div>
            ))}
            <span className="spacer" />
            <span className="muted">← → to switch photo</span>
          </div>
        </div>

        <aside className="meta-panel rv-panel">
          <div className="section-label">Checks · photo {idx + 1}</div>
          {photo?.missing ? (
            <Check ok={false} title="Source image is missing" sub={`Slot ${idx + 1} has no file. Print the sheet without it, or contact the buyer.`}>
              <div className="rv-check-actions">
                <button className="btn sm" onClick={() => setStatus(k, 'held')}>Hold order</button>
              </div>
            </Check>
          ) : (
            photo && (
              <>
                <Check
                  ok={!lowDpi}
                  title={lowDpi ? 'Low resolution' : 'Sharp enough to print'}
                  sub={
                    lowDpi
                      ? `${dpi} DPI at ${fmtMm(frame.w)} × ${fmtMm(frame.h)} mm, under the ${DPI_FLOOR} DPI floor. Usable but soft; zooming out raises DPI.`
                      : `${dpi} DPI at ${fmtMm(frame.w)} × ${fmtMm(frame.h)} mm`
                  }
                >
                  {lowDpi && (
                    <div className="rv-check-actions">
                      <button className="btn sm" onClick={() => updatePhoto(k, photo.id, { approved: true, flagged: false })}>
                        Print anyway
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `Hi! Thanks for your order ${order.id}. The photo "${photo.buyerFilename}" is lower resolution than ideal for a sharp ${product.sizeLabel ? product.sizeLabel + ' ' : ''}print (${dpi} DPI). It will still print, but may look slightly soft. If you have a larger original, reply with it within 24h and we'll use that instead.`
                          );
                        }}
                      >
                        Copy buyer message
                      </button>
                    </div>
                  )}
                </Check>
                <Check
                  ok
                  title={photo.override ? 'Re-framed by you' : "Buyer's own framing"}
                  sub={photo.override ? 'Differs from what the buyer positioned. Reset under the photo to undo.' : 'Crop matches what the buyer positioned.'}
                />
                {aspectWarn && <Check ok={false} title="Crop shape differs from the template" sub={aspectWarn} />}
                {photo.flagged && <Check ok={false} title="Flagged" sub="This photo is flagged and blocks the order until approved." />}
              </>
            )
          )}

          <div className="section-label" style={{ marginTop: 6 }}>Order</div>
          <Check
            ok={!packWarn}
            title={pack ? `Pack of ${pack} · ${order.photos.length} photos received` : `${order.photos.length} photos received`}
            sub={packWarn ?? (pack ? undefined : order.productId ? 'Template picked by hand' : 'Unknown ASIN')}
          />
          {missingCount > 0 && (
            <Check ok={false} title={`${missingCount} image${missingCount > 1 ? 's' : ''} missing from the zip`} />
          )}
          {otherLow > 0 && (
            <Check ok={false} title={`${otherLow} other photo${otherLow > 1 ? 's are' : ' is'} low resolution`} sub="Marked amber in the strip below." />
          )}
          <Check
            ok
            title={`${sheetsPerCopy(order)} sheet${sheetsPerCopy(order) > 1 ? 's' : ''}${order.qty > 1 ? ` × ${order.qty} copies` : ''}`}
            sub={order.photos.length < slots ? `${slots - order.photos.length} blank slot${slots - order.photos.length > 1 ? 's' : ''} on the sheet` : undefined}
          />

          <details className="rv-details">
            <summary>File details</summary>
            <div className="kv"><span className="k">file</span><span className="v">{truncateMiddle(photo?.imageName ?? '—')}</span></div>
            <div className="kv"><span className="k">buyer name</span><span className="v">{truncateMiddle(photo?.buyerFilename ?? '—', 22)}</span></div>
            <div className="kv"><span className="k">source</span><span className="v">{photo ? `${photo.sourceW} × ${photo.sourceH} px` : '—'}</span></div>
            <div className="kv"><span className="k">EXIF</span><span className="v">orientation applied</span></div>
            <div className="kv"><span className="k">crop window</span><span className="v">{photo ? `${photo.crop.w}×${photo.crop.h} @ (${photo.crop.x},${photo.crop.y})` : '—'}</span></div>
            <div className="kv"><span className="k">scale</span><span className="v">{eff ? eff.scale.toFixed(3) : '—'}</span></div>
            <div className="kv"><span className="k">rotation</span><span className="v">{eff ? `${angle}°` : '—'}</span></div>
            <div className="kv"><span className="k">output</span><span className="v">{photo ? `${photo.cropW} × ${photo.cropH} px · JPEG q0.95` : '—'}</span></div>
            <div className="kv"><span className="k">item</span><span className="v">{order.itemId}</span></div>
            <div className="kv"><span className="k">zip</span><span className="v">{truncateMiddle(order.zipName, 24)}</span></div>
          </details>

          <div className="meta-foot">
            <div className="rv-progress-head">
              <strong>{approvedCount} of {order.photos.length} approved</strong>
              <span className="muted">{allApproved(order) ? 'clear to print' : `${order.photos.length - approvedCount} left`}</span>
            </div>
            <div className="meta-progress">
              <i style={{ width: `${(approvedCount / Math.max(1, order.photos.length)) * 100}%` }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['← →', 'previous / next photo'],
  ['A', 'approve photo'],
  ['⇧A', 'approve all photos'],
  ['⇧ arrows', 'nudge 0.3 mm'],
  ['[ ]', 'rotate 1° (⇧ = 5°)'],
  ['R', 'rotate 90°'],
  ['Esc', 'back'],
];

/** One pass/warn line in the checks panel. */
function Check({ ok, title, sub, children }: { ok: boolean; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className={`rv-check${ok ? '' : ' warn'}`}>
      <i>{ok ? '✓' : '!'}</i>
      <div>
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
        {children}
      </div>
    </div>
  );
}
