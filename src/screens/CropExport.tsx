import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../components/common';
import { CropControls, CropFrame, reframeKey, useReframe } from '../components/CropEditor';
import { cropPhoto, parseOrderZip } from '../lib/ingest';
import { buildStoredZip } from '../lib/zip';
import { blobUrl } from '../lib/format';
import { DPI_FLOOR, printDpi } from '../lib/geometry';
import type { Order, Photo, Placement } from '../lib/types';

/** "Image 1" + "IMG_0042.jpeg" -> "Image 1_IMG_0042.jpg" */
function cropFileName(p: Photo): string {
  const base = (p.buyerFilename || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '_');
  return `${p.label.replace(/[^\w\- ]+/g, '-')}_${base}.jpg`;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** Standalone tool: crop one order zip exactly as the buyer framed it and save the JPEGs.
 *  Nothing is added to the queue or stored — for when the crops are needed outside the sheet flow. */
export function CropExport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setOrder(null);
    setEditId(null);
    setStatus(`Reading ${file.name}…`);
    try {
      const o = await parseOrderZip(file, (done, total) => setStatus(`Cropping ${done} of ${total}…`));
      setOrder(o);
      setStatus('');
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const crops = order ? order.photos.filter((p) => !p.missing) : [];

  // per-photo re-framing, same controls as Review; the adjusted crop replaces the download
  const [editId, setEditId] = useState<string | null>(null);
  const editing = order?.photos.find((p) => p.id === editId && !p.missing);
  const cropSeq = useRef(0);
  const onReframe = useCallback(async (photo: Photo, placement: Placement | undefined) => {
    const seq = ++cropSeq.current;
    const eff = placement ?? photo.buyerPlacement;
    const res = await cropPhoto(photo.sourceBlob, photo.crop, eff);
    if (seq !== cropSeq.current) return; // a newer adjustment is already on its way
    setOrder((o) =>
      o && {
        ...o,
        photos: o.photos.map((p) =>
          p.id === photo.id
            ? { ...p, override: placement, cropBlob: res.blob, cropW: res.w, cropH: res.h, dpi: printDpi(p.crop, eff.scale) }
            : p
        ),
      }
    );
  }, []);
  const rf = useReframe(editing, onReframe);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (reframeKey(e, rf)) return;
      if (e.key === 'Escape') setEditId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const downloadAll = async () => {
    if (!order || !crops.length) return;
    const files = await Promise.all(
      crops.map(async (p) => ({ name: cropFileName(p), data: new Uint8Array(await p.cropBlob.arrayBuffer()) }))
    );
    download(buildStoredZip(files), `${order.itemId || order.id}-crops.zip`);
  };

  return (
    <div
      className="main"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void load(e.dataTransfer.files[0]);
      }}
    >
      <header className="header">
        <span className="title">Crop export</span>
        <span className="crumb">/ buyer-framed JPEGs from one order zip</span>
        <span className="spacer" />
        <ThemeToggle />
        {order && (
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>Choose another zip</button>
            <button className="btn primary" disabled={!crops.length} onClick={() => void downloadAll()}>
              Download all crops (.zip)
            </button>
          </>
        )}
      </header>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        style={{ display: 'none' }}
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="content">
        {!order && (
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            style={{ padding: '46px 16px' }}
            onClick={() => fileRef.current?.click()}
          >
            <div className="icon">↓</div>
            <div className="t">{status || 'Drop one Amazon order zip'}</div>
            <div className="s">
              Crops each photo the way the buyer framed it and lets you save the JPEGs. The order is not added to
              the queue, and nothing leaves this machine.
            </div>
          </div>
        )}

        {error && (
          <div className="warn-card">
            <div className="t">! Could not read this zip</div>
            {error}
          </div>
        )}

        {order && (
          <>
            <div className="card card-pad cropx-order">
              {blobUrl(order.snapshotBlob) && (
                <img className="snap" src={blobUrl(order.snapshotBlob)} alt="Buyer preview snapshot" />
              )}
              <div>
                <div className="card-title">{order.title || 'Custom order'}</div>
                <div className="kv"><span className="k">order</span><span className="v">{order.id}</span></div>
                <div className="kv"><span className="k">item</span><span className="v">{order.itemId || '—'}</span></div>
                <div className="kv"><span className="k">qty</span><span className="v">{order.qty}</span></div>
                <div className="kv">
                  <span className="k">crops</span>
                  <span className="v">{crops.length} of {order.photos.length} ready</span>
                </div>
                {order.warnings.map((w) => (
                  <div key={w} className="warnline">{w}</div>
                ))}
                {blobUrl(order.snapshotBlob) && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                    Left: the buyer's own preview from Amazon. Compare the crops against it.
                  </div>
                )}
              </div>
            </div>

            {editing && (
              <div className="card card-pad cropx-editor">
                <div className="head">
                  <span className="card-title">Adjust {editing.label}</span>
                  <span className="mono faint">
                    {rf.dpi} DPI{editing.override ? ' · adjusted' : ' · buyer framing'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => setEditId(null)}>Done</button>
                </div>
                <CropFrame photo={editing} r={rf} />
                <CropControls photo={editing} r={rf} />
              </div>
            )}

            <div className="cropx-grid">
              {order.photos.map((p) => (
                <div key={p.id} className={`card cropx-card${p.id === editId ? ' editing' : ''}`}>
                  <div className="thumbwrap">
                    {p.missing ? (
                      <span className="mono faint">image not in zip</span>
                    ) : (
                      <img src={blobUrl(p.cropBlob)} alt={p.label} />
                    )}
                  </div>
                  <div className="body">
                    <div className="card-title">{p.label}</div>
                    <div className="mono faint fname">{p.buyerFilename}</div>
                    {p.missing ? (
                      <div className="warnline">Referenced by the order but missing from the zip.</div>
                    ) : (
                      <>
                        <div className="mono faint">
                          {p.cropW} × {p.cropH} px ·{' '}
                          <span className={p.dpi < DPI_FLOOR ? 'warnline' : undefined}>
                            {p.dpi} DPI{p.dpi < DPI_FLOOR ? ' — low for print' : ''}
                          </span>
                        </div>
                        {p.override && <div className="mono faint">adjusted from buyer framing</div>}
                        <div className="actions">
                          <button className="btn sm" onClick={() => setEditId(p.id === editId ? null : p.id)}>
                            {p.id === editId ? 'Done' : 'Adjust'}
                          </button>
                          <button className="btn sm" onClick={() => download(p.cropBlob, cropFileName(p))}>
                            Download
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
