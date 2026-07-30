import { ThemeToggle } from '../components/common';
import { Sheet } from '../components/Sheet';
import { deriveWaste } from '../lib/geometry';
import type { TemplateDescriptor } from '../lib/geometry';
import type { SheetModel } from '../lib/sheets';
import { effectiveTemplate, useStore } from '../store';
import { instantPhotoPrints } from '../products';

const emptyModel: SheetModel = {
  orderIds: ['403-XXXXXXX-XXXXXXX'],
  slots: [null, null, null, null, null, null],
};

function Field({ label, value, onChange, step = 0.1 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="tmpl-field">
      <span className="k">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      <span className="u">mm</span>
    </label>
  );
}

export function Template() {
  const product = instantPhotoPrints;
  const template = useStore((s) => effectiveTemplate(s, product.id));
  const hasOverride = useStore((s) => !!s.templateOverrides[product.id]);
  const setTemplateOverride = useStore((s) => s.setTemplateOverride);
  const resetTemplateOverride = useStore((s) => s.resetTemplateOverride);

  /** apply an edit, rederiving the cut-waste bars from the new card geometry */
  const apply = (patch: Partial<TemplateDescriptor>) => {
    const next: TemplateDescriptor = { ...template, ...patch };
    const waste = deriveWaste(next);
    setTemplateOverride(product.id, { ...next, ...waste });
  };

  const setCol = (i: number, v: number) => {
    const colX = [...template.colX];
    colX[i] = v;
    apply({ colX });
  };
  const setRow = (i: number, v: number) => {
    const rowTop = [...template.rowTop];
    rowTop[i] = v;
    apply({ rowTop });
  };

  return (
    <div className="main">
      <header className="header">
        <span className="title">{product.name}</span>
        <span className="crumb">/ Template</span>
        <span className="spacer" />
        <ThemeToggle />
        {hasOverride && (
          <button className="btn" onClick={() => resetTemplateOverride(product.id)}>
            Reset to Illustrator template
          </button>
        )}
      </header>
      <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <div className="sheet-canvas card" style={{ flex: 1, padding: 26 }}>
          <Sheet
            model={emptyModel}
            unit={2}
            guides={{ greyBars: true, cropMarks: true, orderId: true, slotNumbers: true }}
            shadow
            template={template}
          />
          <div className="sheet-readout">
            <span>{template.sheet.w} × {template.sheet.h} mm · A4 landscape</span>
            <span>card {template.card.w} × {template.card.h} mm</span>
            <span>photo {template.photo.w} × {template.photo.h} mm</span>
            <span>chin {template.chin} mm</span>
          </div>
        </div>

        <div className="card card-pad" style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>Template editor</div>
          {hasOverride ? (
            <div className="warn-card" style={{ marginBottom: 8 }}>
              <div className="t">! Edited template</div>
              Differs from the verified Illustrator file. Sheets print with these values on this machine.
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.55 }}>
              The verified Illustrator layout. Edits preview live, persist on this machine, and drive every
              screen and print. Grey cut-waste bars rederive automatically.
            </div>
          )}

          <div className="section-label" style={{ padding: 0, marginBottom: 2 }}>Card</div>
          <Field label="card width" value={template.card.w} onChange={(w) => apply({ card: { ...template.card, w } })} />
          <Field label="card height" value={template.card.h} onChange={(h) => apply({ card: { ...template.card, h } })} />
          <Field label="photo width" value={template.photo.w} onChange={(w) => apply({ photo: { ...template.photo, w } })} />
          <Field label="photo height" value={template.photo.h} onChange={(h) => apply({ photo: { ...template.photo, h } })} />
          <Field label="photo inset (l/r/t)" value={template.photoInset} onChange={(photoInset) => apply({ photoInset })} />
          <Field label="chin" value={template.chin} onChange={(chin) => apply({ chin })} />

          <div className="section-label" style={{ padding: 0, margin: '8px 0 2px' }}>Grid</div>
          {template.colX.map((x, i) => (
            <Field key={`c${i}`} label={`column ${i + 1} left`} value={x} onChange={(v) => setCol(i, v)} />
          ))}
          {template.rowTop.map((y, i) => (
            <Field key={`r${i}`} label={`row ${i + 1} top`} value={y} onChange={(v) => setRow(i, v)} />
          ))}

          <div className="kv" style={{ marginTop: 8 }}>
            <span className="k">crop window</span><span className="v">219 × 260 @ (90,50)</span>
          </div>
          <div className="kv"><span className="k">output crop</span><span className="v">1095 × 1300 px</span></div>

          <div className="muted" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
            Crops are produced at the Amazon window's 219:260 aspect; if the photo area's aspect drifts far from
            that, photos are center-covered into the frame. DPI warnings are computed against the factory photo
            width.
          </div>
        </div>
      </div>
    </div>
  );
}
