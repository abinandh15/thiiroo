import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/common';
import { Sheet } from '../components/Sheet';
import { slotsPerSheet } from '../lib/geometry';
import { findByAsin, productAsins } from '../products';
import { parseVariants } from './AddProduct';
import { printSheets } from '../lib/printJob';
import type { SheetModel } from '../lib/sheets';
import { useStore } from '../store';

/** Template page of a product created from an SVG (Add product). */
export function CustomProduct({ productId }: { productId: string }) {
  const navigate = useNavigate();
  const product = useStore((s) => s.customProducts.find((p) => p.id === productId));
  const saveProduct = useStore((s) => s.saveProduct);
  const removeProduct = useStore((s) => s.removeProduct);
  // fit the preview to the space available
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(640);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // edit form: null = not editing
  const [edit, setEdit] = useState<{ name: string; asins: string; sizeLabel: string } | null>(null);
  const [saveError, setSaveError] = useState('');
  if (!product) return null;

  const parsedEdit = edit ? parseVariants(edit.asins) : null;
  const takenBy = parsedEdit?.variants
    .map((v) => ({ v, hit: findByAsin(v.asin) }))
    .find((x) => x.hit && x.hit.product.id !== product.id);
  const dupAsin = parsedEdit?.variants.find((v, i, all) => all.findIndex((x) => x.asin === v.asin) !== i);
  const editProblem = !edit || !parsedEdit
    ? ''
    : !edit.name.trim()
      ? 'Give the product a name.'
      : parsedEdit.bad.length
        ? `Not an ASIN: ${parsedEdit.bad[0]}`
        : dupAsin
          ? `${dupAsin.asin} is listed twice.`
          : takenBy
            ? `${takenBy.v.asin} already belongs to ${takenBy.hit!.product.name}.`
            : '';
  const startEdit = () => {
    setSaveError('');
    setEdit({
      name: product.name,
      asins: product.variants.map((v) => `${v.asin} ${v.packSize}`).join('\n'),
      sizeLabel: product.sizeLabel,
    });
  };
  const saveEdit = () => {
    if (!edit || !parsedEdit || editProblem) return;
    const err = saveProduct({
      ...product,
      name: edit.name.trim(),
      asin: parsedEdit.variants[0]?.asin ?? '',
      variants: parsedEdit.variants,
      sizeLabel: edit.sizeLabel.trim(),
    });
    if (err) setSaveError(err);
    else setEdit(null);
  };

  const asins = productAsins(product);
  const t = product.template;
  const layout = t.custom!;
  const slots = slotsPerSheet(t);
  const emptyModel: SheetModel = { orderIds: ['403-XXXXXXX-XXXXXXX'], slots: Array.from({ length: slots }, () => null) };
  const frameSizes = [...new Set(layout.photos.map((r) => `${r.w} × ${r.h}`))];
  const pxPerMm = Math.max(0.5, Math.min(2.4, (canvasW - 52) / t.sheet.w));

  return (
    <div className="main">
      <header className="header">
        <span className="title">{product.name}</span>
        <span className="crumb">/ Template</span>
        <span className="spacer" />
        <ThemeToggle />
        <button className="btn" onClick={() => navigate(`/p/${product.id}/queue`)}>Open queue</button>
        <button
          className="btn"
          onClick={() => printSheets([emptyModel], [], t)}
          title="Prints the empty sheet at true size, to check alignment against your stock"
        >
          Print blank test sheet
        </button>
      </header>
      <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <div ref={canvasRef} className="sheet-canvas card" style={{ flex: 1, padding: 26, minWidth: 0 }}>
          <Sheet
            model={emptyModel}
            unit={pxPerMm}
            guides={{ greyBars: true, cropMarks: true, cutLines: true, orderId: true, slotNumbers: true }}
            shadow
            template={t}
          />
          <div className="sheet-readout">
            <span>{t.sheet.w} × {t.sheet.h} mm</span>
            <span>{slots} photo frame{slots === 1 ? '' : 's'} per sheet</span>
            <span>frame {frameSizes.join(', ')} mm</span>
          </div>
        </div>

        <div className="card card-pad" style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <span className="card-title" style={{ flex: 1 }}>Product</span>
            {!edit && <button className="btn sm" onClick={startEdit}>Edit details</button>}
          </div>
          {edit && (
            <div className="addp-form" style={{ width: 'auto', marginBottom: 10 }}>
              <label className="f">
                <span>name</span>
                <input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
              </label>
              <label className="f">
                <span>ASINs — one per line, pack size after it</span>
                <textarea
                  value={edit.asins}
                  onChange={(e) => setEdit({ ...edit, asins: e.target.value })}
                  placeholder={'B0XXXXXXXX 4\nB0YYYYYYYY 8'}
                  spellCheck={false}
                  rows={Math.max(3, edit.asins.split('\n').length + 1)}
                />
              </label>
              <label className="f">
                <span>size label (sidebar)</span>
                <input type="text" value={edit.sizeLabel} onChange={(e) => setEdit({ ...edit, sizeLabel: e.target.value })} />
              </label>
              {(editProblem || saveError) && <div className="warnline" style={{ fontSize: 12, color: 'var(--attention-text)' }}>{editProblem || saveError}</div>}
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                Orders follow their ASIN: adding one routes matching orders here, removing one sends its
                orders to Unassigned unless they were assigned by hand.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn sm primary" disabled={!!editProblem} onClick={saveEdit}>Save</button>
                <button className="btn sm" onClick={() => setEdit(null)}>Cancel</button>
              </div>
            </div>
          )}
          <div className="kv"><span className="k">name</span><span className="v">{product.name}</span></div>
          <div className="kv"><span className="k">size label</span><span className="v">{product.sizeLabel || '—'}</span></div>
          <div className="kv"><span className="k">cut outlines</span><span className="v">{layout.cuts.length}</span></div>
          <div className="kv"><span className="k">source</span><span className="v">imported SVG</span></div>

          <div className="section-label" style={{ padding: 0, margin: '8px 0 2px' }}>ASINs</div>
          {asins.length ? (
            asins.map((v) => (
              <div className="kv" key={v.asin}>
                <span className="k">{v.asin}</span><span className="v">pack of {v.packSize}</span>
              </div>
            ))
          ) : (
            <div className="muted" style={{ fontSize: 11 }}>None yet. Orders reach this product when you assign them by hand, or add an ASIN.</div>
          )}

          {layout.artwork && (
            <label className="addp-check" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={layout.printArtwork}
                onChange={(e) =>
                  saveProduct({ ...product, template: { ...t, custom: { ...layout, printArtwork: e.target.checked } } })
                }
              />
              <span>Print the SVG artwork under the photos</span>
            </label>
          )}

          <button
            className="btn sm"
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
            onClick={() => {
              if (window.confirm(`Delete the product "${product.name}"? This cannot be undone.`)) {
                removeProduct(product.id);
                navigate('/');
              }
            }}
          >
            Delete product
          </button>
        </div>
      </div>
    </div>
  );
}
