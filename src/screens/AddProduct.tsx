import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/common';
import { buildTemplate, orderedPhotos, parseSvgTemplate, rescale, sameSize } from '../lib/svgTemplate';
import type { ParsedSvg, ShapeRole } from '../lib/svgTemplate';
import { findByAsin, newProductId } from '../products';
import type { Product, ProductVariant } from '../products';
import { useStore } from '../store';

const NEXT_ROLE: Record<ShapeRole, ShapeRole> = { photo: 'cut', cut: 'ignore', ignore: 'photo' };
/** above this the SVG is too big for browser storage alongside other products */
const MAX_ARTWORK_BYTES = 1_500_000;

/** one variant per line: "B0XXXXXXXX 12" or "B0XXXXXXXX, 12"; pack size optional */
function parseVariants(text: string): { variants: ProductVariant[]; bad: string[] } {
  const variants: ProductVariant[] = [];
  const bad: string[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Z0-9]{10})(?:[\s,=:x×]+(\d+))?$/i.exec(line);
    if (!m) bad.push(line);
    else variants.push({ asin: m[1].toUpperCase(), packSize: m[2] ? Number(m[2]) : 1 });
  }
  return { variants, bad };
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

export function AddProduct() {
  const navigate = useNavigate();
  const saveProduct = useStore((s) => s.saveProduct);
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSvg | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState('');
  const [asins, setAsins] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [printArtwork, setPrintArtwork] = useState(true);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const p = parseSvgTemplate(await file.text());
      setParsed(p);
      setFileName(file.name);
      if (!name) setName(file.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' '));
      const first = orderedPhotos(p.shapes)[0];
      if (first) setSizeLabel(`${fmt(first.rect.w)}×${fmt(first.rect.h)}mm`);
    } catch (e) {
      setParsed(null);
      setError((e as Error).message);
    }
  };

  /** click = change every shape of that size; alt-click = only the one clicked */
  const cycle = (id: number, onlyThis: boolean) => {
    if (!parsed) return;
    const target = parsed.shapes.find((s) => s.id === id)!;
    const role = NEXT_ROLE[target.role];
    setParsed({
      ...parsed,
      shapes: parsed.shapes.map((s) =>
        s.id === id || (!onlyThis && s.role === target.role && sameSize(s.rect, target.rect)) ? { ...s, role } : s
      ),
    });
  };

  const photos = useMemo(() => (parsed ? orderedPhotos(parsed.shapes) : []), [parsed]);
  const cutCount = parsed?.shapes.filter((s) => s.role === 'cut').length ?? 0;
  const ignoreCount = parsed?.shapes.filter((s) => s.role === 'ignore').length ?? 0;
  const frameSizes = [...new Set(photos.map((p) => `${fmt(p.rect.w)}×${fmt(p.rect.h)}`))];
  const { variants, bad } = parseVariants(asins);
  const taken = variants.map((v) => findByAsin(v.asin)).find(Boolean);
  const tooBig = !!parsed && parsed.artworkBytes > MAX_ARTWORK_BYTES;

  const problem = !parsed
    ? ''
    : !name.trim()
      ? 'Give the product a name.'
      : photos.length === 0
        ? 'Mark at least one shape as a photo frame.'
        : bad.length
          ? `Not an ASIN: ${bad[0]}`
          : taken
            ? `${variants.find((v) => findByAsin(v.asin))!.asin} already belongs to ${taken.product.name}.`
            : '';

  const save = () => {
    if (!parsed || problem) return;
    const product: Product = {
      id: newProductId(name.trim()),
      name: name.trim(),
      asin: variants[0]?.asin ?? '',
      variants,
      sizeLabel: sizeLabel.trim(),
      template: buildTemplate(parsed, { printArtwork, keepArtwork: !tooBig }),
      custom: true,
    };
    const err = saveProduct(product);
    if (err) setError(err);
    else navigate(`/p/${product.id}/template`);
  };

  const fontSize = parsed ? Math.max(3, Math.min(parsed.sheet.w, parsed.sheet.h) / 28) : 4;

  return (
    <div className="main">
      <header className="header">
        <span className="title">Add product</span>
        <span className="crumb">/ from an SVG template</span>
        <span className="spacer" />
        <ThemeToggle />
      </header>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <div className="sheet-canvas card addp-canvas" style={{ flex: 1, padding: 26, minWidth: 0 }}>
          {!parsed ? (
            <div
              className={`dropzone${drag ? ' drag' : ''}`}
              style={{ width: '100%', maxWidth: 460 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void load(e.dataTransfer.files[0]);
              }}
            >
              <div className="icon">+</div>
              <div className="t">Drop the template SVG here</div>
              <div className="s">
                Export the print sheet from Illustrator as SVG, with each photo area drawn as a rectangle.
              </div>
            </div>
          ) : (
            <>
              <div style={{ width: '100%', maxWidth: parsed.sheet.w * 2.6 }}>
                <svg viewBox={`0 0 ${parsed.sheet.w} ${parsed.sheet.h}`}>
                  <image href={parsed.artwork} x={0} y={0} width={parsed.sheet.w} height={parsed.sheet.h} />
                  {/* ignored first so photo frames and cut lines stay clickable on top */}
                  {[...parsed.shapes]
                    .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
                    .map((s) => (
                      <rect
                        key={s.id}
                        className={`shape ${s.role}`}
                        x={s.rect.x}
                        y={s.rect.y}
                        width={s.rect.w}
                        height={s.rect.h}
                        fill="transparent"
                        onClick={(e) => cycle(s.id, e.altKey)}
                      >
                        <title>
                          {`${s.role} · ${fmt(s.rect.w)} × ${fmt(s.rect.h)} mm${s.name ? ` · ${s.name}` : ''}`}
                        </title>
                      </rect>
                    ))}
                  {photos.map((s, i) => (
                    <text
                      key={s.id}
                      x={s.rect.x + s.rect.w / 2}
                      y={s.rect.y + s.rect.h / 2}
                      fontSize={Math.min(fontSize, s.rect.h * 0.6)}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {i + 1}
                    </text>
                  ))}
                </svg>
              </div>
              <div className="addp-legend">
                <span><i className="photo" />photo frame</span>
                <span><i className="cut" />cut outline</span>
                <span><i className="ignore" />ignored</span>
                <span>Click a shape to change its role · Alt-click changes only that one</span>
              </div>
              <div className="sheet-readout">
                <span>{fileName}</span>
                <span>{parsed.sheet.w} × {parsed.sheet.h} mm</span>
                <span>{parsed.sizeSource}</span>
              </div>
            </>
          )}
          {error && (
            <div className="warn-card" style={{ maxWidth: 460 }}>
              <div className="t">! Could not use this file</div>
              {error}
            </div>
          )}
        </div>

        {parsed && (
          <div className="card card-pad addp-form">
            <div className="card-title" style={{ marginBottom: 4 }}>Product</div>
            <label className="f">
              <span>name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Photo Strips" />
            </label>
            <label className="f">
              <span>ASINs — one per line, pack size after it</span>
              <textarea
                value={asins}
                onChange={(e) => setAsins(e.target.value)}
                placeholder={'B0XXXXXXXX 4\nB0YYYYYYYY 8'}
                spellCheck={false}
              />
            </label>
            <label className="f">
              <span>size label (sidebar)</span>
              <input type="text" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} />
            </label>

            <div className="section-label" style={{ padding: 0, margin: '8px 0 2px' }}>Sheet</div>
            <label className="tmpl-field">
              <span className="k">sheet width</span>
              <input
                type="number"
                step={0.1}
                value={parsed.sheet.w}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 20) setParsed(rescale(parsed, v));
                }}
              />
              <span className="u">mm</span>
            </label>
            <div className="kv"><span className="k">sheet height</span><span className="v">{parsed.sheet.h} mm</span></div>
            {parsed.sizeGuessed && (
              <div className="warn-card">
                <div className="t">! Check the sheet size</div>
                The file carries no physical unit. Correct the width above if {parsed.sheet.w} mm is wrong.
              </div>
            )}

            <div className="section-label" style={{ padding: 0, margin: '8px 0 2px' }}>Detected</div>
            <div className="kv"><span className="k">photo frames per sheet</span><span className="v">{photos.length}</span></div>
            <div className="kv">
              <span className="k">frame size</span>
              <span className="v">{frameSizes.length ? `${frameSizes.join(', ')} mm` : '—'}</span>
            </div>
            <div className="kv"><span className="k">cut outlines</span><span className="v">{cutCount}</span></div>
            <div className="kv"><span className="k">ignored shapes</span><span className="v">{ignoreCount}</span></div>
            {frameSizes.length > 1 && (
              <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.55 }}>
                Frames come in {frameSizes.length} sizes. If some are decoration, click them until they show as ignored.
              </div>
            )}

            {tooBig ? (
              <div className="warn-card" style={{ marginTop: 6 }}>
                <div className="t">! Artwork too large to store</div>
                The SVG is {(parsed.artworkBytes / 1e6).toFixed(1)} MB, likely from embedded images. The layout will be
                saved, but the artwork itself will not be kept or printed.
              </div>
            ) : (
              <label className="addp-check" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={printArtwork} onChange={(e) => setPrintArtwork(e.target.checked)} />
                <span>Print the SVG artwork under the photos (borders, logo, cut bars). Off prints photos only.</span>
              </label>
            )}

            {problem && <div className="warnline" style={{ marginTop: 6 }}>{problem}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn primary" disabled={!!problem} onClick={save}>Save product</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>Choose another SVG</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
