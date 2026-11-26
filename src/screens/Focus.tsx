import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/focus.css';
import { effectiveTemplate, orderKey, sheetCount, useStore } from '../store';
import { listProducts, packSizeOf, packWarning, productPath, resolveProduct } from '../products';
import { slotsPerSheet } from '../lib/geometry';
import { buildSheets } from '../lib/sheets';
import { blobUrl, timeHM } from '../lib/format';
import { Sheet } from '../components/Sheet';
import { ImportDrop } from '../components/ImportDrop';
import { StatusPill } from '../components/common';
import type { Order } from '../lib/types';

type Step = 'import' | 'review' | 'print' | 'done';

const shortId = (id: string) => (id.length > 12 ? id.slice(0, 11) + '…' : id);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const printable = (o: Order) => o.photos.filter((p) => !p.missing);
const lowDpiCount = (o: Order) => printable(o).filter((p) => p.dpi < 150).length;
const missingCount = (o: Order) => o.photos.filter((p) => p.missing).length;

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || t.isContentEditable;
}

export function Focus() {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const customProducts = useStore((s) => s.customProducts);
  const combineMode = useStore((s) => s.combineMode);
  const buildBatch = useStore((s) => s.buildBatch);
  const importFiles = useStore((s) => s.importFiles);
  const guides = useStore((s) => s.guides);

  // customProducts: re-evaluate the registry when a product is added or deleted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const products = useMemo(() => listProducts(), [customProducts]);

  const today = new Date().setHours(0, 0, 0, 0);
  const byProduct = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of orders) {
      const id = resolveProduct(o)?.id;
      if (!id) continue;
      const list = m.get(id);
      if (list) list.push(o);
      else m.set(id, [o]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, customProducts]);

  const openCount = (id: string) =>
    (byProduct.get(id) ?? []).filter((o) => o.status !== 'printed' && o.status !== 'done').length;

  const [chosen, setChosen] = useState<string | null>(null);
  const defaultProduct = useMemo(() => {
    const has = (st: (o: Order) => boolean) => products.find((p) => (byProduct.get(p.id) ?? []).some(st));
    return (has((o) => o.status === 'needs_review') ?? has((o) => o.status === 'ready') ?? products[0]).id;
  }, [products, byProduct]);
  const product = products.find((p) => p.id === chosen) ?? products.find((p) => p.id === defaultProduct) ?? products[0];

  const mine = byProduct.get(product.id) ?? [];
  const reviewable = mine.filter((o) => o.status === 'needs_review' || o.status === 'held');
  const ready = mine.filter((o) => o.status === 'ready');
  const importedToday = mine.filter((o) => o.importedAt >= today).length;
  const doneToday = mine.filter((o) => (o.status === 'printed' || o.status === 'done') && (o.printedAt ?? 0) >= today).length;

  const [clicked, setClicked] = useState<Step | null>(null);
  const auto: Step = reviewable.length ? 'review' : ready.length ? 'print' : 'import';
  const clickedEmpty = (clicked === 'review' && !reviewable.length) || (clicked === 'print' && !ready.length);
  const step: Step = clicked && !clickedEmpty ? clicked : auto;
  const pickProduct = (id: string) => { setChosen(id); setClicked(null); };

  const template = useStore((s) => effectiveTemplate(s, product.id));
  const slots = slotsPerSheet(template);
  const sheets = useMemo(() => buildSheets(ready, combineMode, slots), [ready, combineMode, slots]);
  const totalSheets = sheets.length;

  const hero = reviewable[0];
  const reviewHero = () => {
    if (hero) navigate(productPath(product.id, 'review/' + encodeURIComponent(orderKey(hero))));
  };
  const printAll = () => {
    if (!ready.length) return;
    buildBatch(ready.map(orderKey));
    navigate(productPath(product.id, 'print-batch'));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (step === 'review' && (k === 'enter' || k === 'r')) { e.preventDefault(); reviewHero(); }
      else if (step === 'print' && (k === 'enter' || k === 'p')) { e.preventDefault(); printAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hero, ready, product.id]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void importFiles(files);
  };

  // today's totals, all products (same maths as Overview)
  const printedToday = orders.filter((o) => o.printedAt && o.printedAt >= today);
  const sumPrints = printedToday.reduce((n, o) => n + printable(o).length * o.qty, 0);
  const sumSheets = printedToday.reduce((n, o) => n + sheetCount(o), 0);

  const steps: { id: Step; label: string; note: string }[] = [
    { id: 'import', label: 'Import', note: `${importedToday} today` },
    { id: 'review', label: 'Review', note: `${reviewable.length} left` },
    { id: 'print', label: 'Print', note: `${ready.length} ready` },
    { id: 'done', label: 'Done', note: `${doneToday} today` },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);

  return (
    <div className="main fx-root" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="fx-chips">
        {products.map((p) => (
          <button key={p.id} className={`fx-chip${p.id === product.id ? ' on' : ''}`} onClick={() => pickProduct(p.id)}>
            {p.name} <b>{openCount(p.id)}</b>
          </button>
        ))}
      </div>

      <div className="fx-track">
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'contents' }}>
            <button
              className={`fx-tstep${i === activeIdx ? ' on' : i < activeIdx ? ' done' : ''}`}
              onClick={() => setClicked(s.id)}
            >
              {i < activeIdx ? '✓ ' : ''}{s.label} <b>{s.note}</b>
            </button>
            {i < steps.length - 1 && <div className="fx-tline" />}
          </div>
        ))}
      </div>

      {step === 'review' && hero && (
        <div className="fx-body">
          <div className="card fx-upnext">
            <p className="fx-h4">Up next</p>
            <div className="fx-list">
              {reviewable.map((o, i) => {
                const first = printable(o)[0];
                return (
                  <div
                    key={orderKey(o)}
                    className={`fx-oi${i === 0 ? ' on' : ''}`}
                    onClick={() => navigate(productPath(product.id, 'review/' + encodeURIComponent(orderKey(o))))}
                  >
                    <span className="fx-oi-img">{first && <img src={blobUrl(first.cropBlob)} alt="" />}</span>
                    <div>
                      <div className="oid">{shortId(o.id)}</div>
                      <div className="fx-mut">{plural(printable(o).length, 'photo')}{o.status === 'held' ? ' · on hold' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {ready.length > 0 && <div className="fx-mut fx-foot">Then: print {plural(ready.length, 'ready order')}</div>}
          </div>

          <div className="fx-hero-wrap">
            <div className="fx-order">
              <div className="fx-order-head">
                <span className="oid fx-bigid">{hero.id}</span>
                <StatusPill status={hero.status} />
                {packSizeOf(hero) && <span className="pill neutral">Pack of {packSizeOf(hero)}</span>}
              </div>
              <div className="fx-photos">
                {hero.photos.map((p) => (
                  <div key={p.id} className={`fx-photo${p.missing ? ' missing' : p.dpi < 150 ? ' low' : ''}`}>
                    {p.missing ? <span>missing</span> : <img src={blobUrl(p.cropBlob)} alt={p.label} />}
                  </div>
                ))}
              </div>
              <div className="fx-tags">
                {lowDpiCount(hero) > 0 && <span className="pill warn">{lowDpiCount(hero)} low DPI</span>}
                {missingCount(hero) > 0 && <span className="pill warn">{missingCount(hero)} missing</span>}
                {packWarning(hero) && <span className="fx-warn-text">{packWarning(hero)}</span>}
              </div>
              <button className="btn dark fx-cta" onClick={reviewHero}>
                Review this order <kbd className="fx-kbd">Enter</kbd>
              </button>
            </div>
          </div>

          <div className="card fx-side">
            <p className="fx-h4">This order</p>
            <HeroChecks order={hero} />
            <div className="fx-grow" />
            <div className="fx-mut fx-foot">{plural(reviewable.length, 'order')} left to review</div>
          </div>
        </div>
      )}

      {step === 'print' && (
        <div className="fx-body">
          <div className="card fx-upnext">
            <p className="fx-h4">In this print run</p>
            <div className="fx-list">
              {ready.map((o) => {
                const first = printable(o)[0];
                return (
                  <div key={orderKey(o)} className="fx-oi">
                    <span className="fx-oi-img">{first && <img src={blobUrl(first.cropBlob)} alt="" />}</span>
                    <div>
                      <div className="oid">{shortId(o.id)}</div>
                      <div className="fx-mut">{plural(sheetCount(o), 'sheet')} · {plural(printable(o).length, 'photo')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card fx-stage">
            <div className="fx-stage-head">
              <b>{plural(ready.length, 'order')} {ready.length === 1 ? 'is' : 'are'} ready · {plural(totalSheets, 'sheet')}</b>
            </div>
            <div className="fx-sheets">
              {sheets.slice(0, 6).map((s, i) => (
                <div key={i} className="fx-sheet">
                  <Sheet model={s} unit={0.55} guides={guides} shadow template={template} />
                  <div className="fx-mut fx-cap">Sheet {i + 1} · {s.orderIds.map(shortId).join(' + ')}</div>
                </div>
              ))}
            </div>
            {totalSheets > 6 && <div className="fx-mut">+{totalSheets - 6} more sheets</div>}
          </div>

          <div className="card fx-side">
            <p className="fx-h4">Before you print</p>
            <Check ok>A4 landscape, margins none</Check>
            <Check ok>Scale 100%</Check>
            <Check>Headers &amp; footers off</Check>
            <div className="fx-grow" />
            <button className="btn primary fx-cta" onClick={printAll}>
              Print {plural(totalSheets, 'sheet')} <kbd className="fx-kbd">Enter</kbd>
            </button>
            <div className="fx-mut fx-note">
              The print dialog and the “mark as printed” confirmation open on the next screen.
            </div>
          </div>
        </div>
      )}

      {(step === 'import' || step === 'done') && (
        <div className="fx-center">
          <h2>{mine.length === 0 ? 'Import orders' : step === 'done' ? 'Done today' : 'All caught up'}</h2>
          <p>
            {mine.length === 0
              ? `No ${product.name} orders yet. Download the customization zips from Seller Central and drop them here.`
              : 'Nothing to review or print. Download the customization zips from Seller Central and drop them here. Everything stays on this machine.'}
          </p>
          <div className="fx-drop"><ImportDrop /></div>
          <div className="fx-sum">
            <div className="card"><b>{printedToday.length}</b><span className="fx-mut">orders done today</span></div>
            <div className="card"><b>{sumPrints}</b><span className="fx-mut">prints</span></div>
            <div className="card"><b>{sumSheets}</b><span className="fx-mut">sheets used</span></div>
          </div>
          {mine.length > 0 && (
            <div className="fx-mut">Last import {timeHM(Math.max(...mine.map((o) => o.importedAt)))}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Check({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <div className={`fx-chk${ok ? '' : ' w'}`}>
      <i>{ok ? '✓' : '!'}</i>
      <div>{children}</div>
    </div>
  );
}

function HeroChecks({ order }: { order: Order }) {
  const got = printable(order).length;
  const pack = packSizeOf(order);
  const dpis = printable(order).map((p) => p.dpi);
  const min = dpis.length ? Math.round(Math.min(...dpis)) : undefined;
  const warn = packWarning(order);
  const approved = order.photos.filter((p) => p.approved && !p.missing).length;
  return (
    <>
      <Check ok={pack === undefined || got === pack}>
        {got} photo{got === 1 ? '' : 's'} received{pack ? ` of ${pack}` : ''}
      </Check>
      <Check ok={min !== undefined && min >= 150}>
        {min === undefined ? 'No photos to measure' : `Lowest resolution ${min} DPI`}
        {lowDpiCount(order) > 0 && <small>{plural(lowDpiCount(order), 'photo')} under 150 DPI</small>}
      </Check>
      <Check ok={approved === got && got > 0}>{approved} of {got} approved</Check>
      {missingCount(order) > 0 && <Check>{plural(missingCount(order), 'file')} missing from the zip</Check>}
      {warn && <Check>{warn}</Check>}
    </>
  );
}
