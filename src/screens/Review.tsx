import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { allApproved, orderKey, sheetsPerCopy, useStore } from '../store';
import { packSizeOf, packWarning } from '../products';
import type { Order, Photo, Placement } from '../lib/types';
import { blobUrl, truncateMiddle } from '../lib/format';
import { DPI_FLOOR, PHOTO, SLOTS_PER_SHEET } from '../lib/geometry';
import { StatusPill, ThemeToggle } from '../components/common';
import { CropControls, CropFrame, FRAME_H, FRAME_W, reframeKey, useReframe } from '../components/CropEditor';

const CANVAS_PX = 330; // buyer 400x400 canvas preview size

export function Review() {
  const { key: rawKey } = useParams();
  const orders = useStore((s) => s.orders);
  const navigate = useNavigate();

  const reviewables = useMemo(
    () => orders.filter((o) => o.status === 'needs_review' || o.status === 'held'),
    [orders]
  );
  const key = rawKey ? decodeURIComponent(rawKey) : reviewables[0] ? orderKey(reviewables[0]) : undefined;
  const order = orders.find((o) => orderKey(o) === key);

  if (!order) {
    return (
      <div className="main">
        <header className="header">
          <a onClick={() => navigate('/p/instant-photo-prints/queue')} style={{ cursor: 'pointer' }}>← Queue</a>
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
  return <ReviewInner key={orderKey(order)} order={order} reviewables={reviewables} />;
}

function reviewReason(o: Order): { text: string; ok: boolean } {
  const low = o.photos.filter((p) => !p.missing && p.dpi < DPI_FLOOR).length;
  const missing = o.photos.filter((p) => p.missing).length;
  if (missing) return { text: `${missing} missing file · ${o.photos.length} photos`, ok: false };
  if (low) return { text: `${low} low DPI · ${o.photos.length} photos`, ok: false };
  return { text: `Not yet reviewed · ${o.photos.length} photos`, ok: true };
}

function ReviewInner({ order, reviewables }: { order: Order; reviewables: Order[] }) {
  const k = orderKey(order);
  const navigate = useNavigate();
  const updatePhoto = useStore((s) => s.updatePhoto);
  const approveAll = useStore((s) => s.approveAll);
  const reframePhoto = useStore((s) => s.reframePhoto);
  const setStatus = useStore((s) => s.setStatus);

  const [idx, setIdx] = useState(0);
  const photo: Photo | undefined = order.photos[idx];

  const onReframe = useCallback(
    (p: Photo, placement: Placement | undefined) => void reframePhoto(k, p.id, placement),
    [k, reframePhoto]
  );
  const rf = useReframe(photo, onReframe);
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
      } else if (e.key === 'Escape') navigate('/p/instant-photo-prints/queue');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const approvedCount = order.photos.filter((p) => p.approved || p.missing).length;
  const kCanvas = CANVAS_PX / 400;

  return (
    <div className="main">
      <header className="header">
        <a onClick={() => navigate('/p/instant-photo-prints/queue')} style={{ cursor: 'pointer', fontSize: 12 }}>← Queue</a>
        <span className="title mono">{order.id}</span>
        <StatusPill status={order.status} />
        <span className="crumb">Photo {idx + 1} of {order.photos.length}</span>
        <span className="spacer" />
        <span className="kbd-legend">← → photo · ⇧arrows nudge · [ ] rotate 1° · A approve · R rotate 90° · esc back</span>
        <ThemeToggle />
        <button
          className="btn"
          onClick={() => setStatus(k, order.status === 'held' ? 'needs_review' : 'held')}
        >
          {order.status === 'held' ? 'Release hold' : 'Hold order'}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            approveAll(k);
            if (nextReviewable) navigate(`/p/instant-photo-prints/review/${encodeURIComponent(orderKey(nextReviewable))}`);
            else navigate('/p/instant-photo-prints/queue');
          }}
        >
          Approve all &amp; continue →
        </button>
      </header>

      <div className="review-body">
        <aside className="review-rail">
          <div className="rail-head section-label">Review queue · {reviewables.length}</div>
          {reviewables.map((o) => {
            const reason = reviewReason(o);
            return (
              <div
                key={orderKey(o)}
                className={`item${orderKey(o) === k ? ' active' : ''}`}
                onClick={() => navigate(`/p/instant-photo-prints/review/${encodeURIComponent(orderKey(o))}`)}
              >
                <div className="id">{o.id}</div>
                <div className={`why${reason.ok ? ' ok' : ''}`}>{reason.text}</div>
              </div>
            );
          })}
          <div className="foot">
            Every order passes through here before it can be printed. Approve-all clears a clean order in one
            keystroke.
          </div>
        </aside>

        <div className="stage-col">
          <div className="stage">
            {/* buyer preview */}
            <div>
              <div className="stage-caption top">Buyer preview · 400×400 snapshot</div>
              <div className="buyer-canvas" style={{ width: CANVAS_PX, height: CANVAS_PX }}>
                {blobUrl(order.snapshotBlob) ? (
                  <img
                    src={blobUrl(order.snapshotBlob)}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                    alt="Buyer snapshot"
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="faint mono">
                    no snapshot in zip
                  </div>
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
              <div className="stage-caption">
                crop window {photo?.crop.w}×{photo?.crop.h} @ ({photo?.crop.x},{photo?.crop.y})
              </div>
            </div>

            <div className="stage-divider" />

            {/* our crop */}
            <div>
              <div className="stage-caption top accent">Our crop · 1095×1300 px · JPEG q0.95</div>
              {photo?.missing ? (
                <div
                  className="crop-frame"
                  style={{ width: FRAME_W, height: FRAME_H, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--attention)', background: 'var(--attention-tint)' }}
                >
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{ fontWeight: 600, color: 'var(--attention-text)' }}>image not in zip</div>
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                      The order JSON references <span className="mono">{truncateMiddle(photo.imageName)}</span> but the
                      zip does not contain it. Print will skip this slot.
                    </div>
                  </div>
                </div>
              ) : (
                photo && eff && <CropFrame photo={photo} r={rf} />
              )}
              {photo && <CropControls photo={photo} r={rf} />}
            </div>
          </div>

          <div className="filmstrip">
            <span className="label">PHOTOS</span>
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
            {Array.from({ length: Math.max(0, SLOTS_PER_SHEET - order.photos.length) }, (_, i) => (
              <div key={`e${i}`} className="fthumb empty">empty<br />slot</div>
            ))}
            <span className="spacer" />
            {photo && !photo.missing && (
              <>
                <button
                  className="btn sm"
                  onClick={() => updatePhoto(k, photo.id, { flagged: !photo.flagged, approved: false })}
                >
                  {photo.flagged ? 'Unflag photo' : 'Flag photo'}
                </button>
                <button
                  className="btn dark"
                  onClick={() => {
                    updatePhoto(k, photo.id, { approved: true, flagged: false });
                    setIdx((i) => Math.min(i + 1, order.photos.length - 1));
                  }}
                >
                  Approve photo <span style={{ opacity: 0.6 }}>A</span>
                </button>
              </>
            )}
          </div>
        </div>

        <aside className="meta-panel">
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Photo {idx + 1}</div>
            <div className="kv"><span className="k">file</span><span className="v">{truncateMiddle(photo?.imageName ?? '—')}</span></div>
            <div className="kv"><span className="k">buyer name</span><span className="v">{truncateMiddle(photo?.buyerFilename ?? '—', 22)}</span></div>
            <div className="kv"><span className="k">source</span><span className="v">{photo ? `${photo.sourceW} × ${photo.sourceH} px` : '—'}</span></div>
            <div className="kv"><span className="k">EXIF</span><span className="v">orientation applied</span></div>
            <div className="kv"><span className="k">scale</span><span className="v">{eff ? eff.scale.toFixed(3) : '—'}</span></div>
            <div className="kv"><span className="k">rotation</span><span className="v">{eff ? `${eff.angle > 180 ? eff.angle - 360 : eff.angle}°` : '—'}</span></div>
            <div className="kv"><span className="k">output</span><span className="v">{photo ? `${photo.cropW} × ${photo.cropH} px` : '—'}</span></div>
            <div className="kv">
              <span className="k">print DPI</span>
              <span className={`v${dpi && dpi < DPI_FLOOR ? ' warn' : ''}`}>{dpi || '—'}</span>
            </div>
          </div>

          {photo && !photo.missing && dpi < DPI_FLOOR && (
            <div className="warn-card">
              <div className="t">! Low resolution</div>
              {dpi} DPI at {PHOTO.w} × {PHOTO.h} mm — under the {DPI_FLOOR} DPI floor. Prints usable but soft.
              Zooming out increases DPI.
              <div className="actions">
                <button className="btn sm" onClick={() => updatePhoto(k, photo.id, { approved: true, flagged: false })}>
                  Print anyway
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `Hi! Thanks for your order ${order.id}. The photo "${photo.buyerFilename}" is lower resolution than ideal for a sharp ${'3×4'}-inch print (${dpi} DPI). It will still print, but may look slightly soft. If you have a larger original, reply with it within 24h and we'll use that instead.`
                    );
                  }}
                >
                  Copy buyer message
                </button>
              </div>
            </div>
          )}

          {photo?.missing && (
            <div className="warn-card">
              <div className="t">! Missing image</div>
              Slot {idx + 1} has no source file. Print the sheet without this slot, or contact the buyer.
              <div className="actions">
                <button className="btn sm" onClick={() => setStatus(k, 'held')}>Hold order</button>
              </div>
            </div>
          )}

          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Order</div>
            <div className="kv"><span className="k">item</span><span className="v">{order.itemId}</span></div>
            <div className="kv"><span className="k">qty</span><span className="v">{order.qty}</span></div>
            <div className="kv"><span className="k">pack</span><span className="v">{packSizeOf(order) ?? 'unknown ASIN'}</span></div>
            <div className="kv"><span className="k">photos</span><span className="v">{order.photos.length} of {packSizeOf(order) ?? SLOTS_PER_SHEET}</span></div>
            {packWarning(order) && <div className="warnline">{packWarning(order)}</div>}
            <div className="kv">
              <span className="k">sheets</span>
              <span className="v">
                {sheetsPerCopy(order)}
                {order.photos.length < SLOTS_PER_SHEET ? ` (${SLOTS_PER_SHEET - order.photos.length} blanks)` : ''}
              </span>
            </div>
            <div className="kv"><span className="k">zip</span><span className="v">{truncateMiddle(order.zipName, 24)}</span></div>
          </div>

          <div className="meta-foot">
            {approvedCount} of {order.photos.length} photos approved.{' '}
            {allApproved(order)
              ? 'Order is clear to print.'
              : 'Order unlocks for printing when all are cleared.'}
            <div className="meta-progress">
              <i style={{ width: `${(approvedCount / Math.max(1, order.photos.length)) * 100}%` }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
