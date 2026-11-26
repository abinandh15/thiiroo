import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/common';
import { Sheet } from '../components/Sheet';
import { slotsPerSheet } from '../lib/geometry';
import { productAsins } from '../products';
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
  if (!product) return null;

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
          <div className="card-title" style={{ marginBottom: 4 }}>Product</div>
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
