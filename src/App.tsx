import { useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { effectiveTemplate, useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Board } from './screens/Board';
import { Focus } from './screens/Focus';
import { PrintRoot } from './components/PrintRoot';
import { Overview } from './screens/Overview';
import { Queue } from './screens/Queue';
import { Review } from './screens/Review';
import { PrintLayout } from './screens/PrintLayout';
import { BatchPrint } from './screens/BatchPrint';
import { Template } from './screens/Template';
import { getProduct, resolveProduct } from './products';
import { slotsPerSheet } from './lib/geometry';
import { useRouteProduct } from './products/useRouteProduct';
import { Unassigned } from './screens/Unassigned';
import { AddProduct } from './screens/AddProduct';
import { CustomProduct } from './screens/CustomProduct';
import { CropExport } from './screens/CropExport';

/** Dev-only helpers driven by query params: ?sample=1 imports public/sample-order.zip,
 *  ?approveall=1 approves everything, ?printtest=1 mounts print sheets for print-to-pdf checks. */
function DevHooks() {
  const loaded = useStore((s) => s.loaded);
  useEffect(() => {
    if (!import.meta.env.DEV || !loaded) return;
    const q = new URLSearchParams(window.location.search);
    void (async () => {
      const { orders, importFiles, approveAll } = useStore.getState();
      if (q.has('sample') && orders.length === 0) {
        const res = await fetch('/sample-order.zip');
        if (res.ok) {
          const blob = await res.blob();
          await importFiles([new File([blob], 'sample-order.zip', { type: 'application/zip' })]);
        }
      }
      if (q.has('approveall')) {
        const { orders: os } = useStore.getState();
        for (const o of os) approveAll(`${o.id}::${o.itemId}`);
      }
      if (q.has('printtest')) {
        const { orders: os, combineMode } = useStore.getState();
        const { buildSheets } = await import('./lib/sheets');
        const { usePrintJob } = await import('./lib/printJob');
        // one print job = one template: take the product of the first printable order
        const printable = os.filter((o) => o.status === 'ready' || o.status === 'printed' || o.status === 'done');
        const product = printable.map((o) => resolveProduct(o)).find(Boolean);
        if (product) {
          const t = effectiveTemplate(useStore.getState(), product.id);
          const ready = printable.filter((o) => resolveProduct(o)?.id === product.id);
          usePrintJob.getState().setJob(buildSheets(ready, combineMode, slotsPerSheet(t)), [], t);
        }
      }
    })();
  }, [loaded]);
  return null;
}

/** Guards every /p/:productId/* route: unknown product ids go home. */
function ProductGate() {
  const { productId } = useParams();
  useStore((s) => s.customProducts); // re-check when a custom product is added or deleted
  if (!productId || !getProduct(productId)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Built-in products edit their template live; custom ones show their imported layout. */
function TemplateRoute() {
  const product = useRouteProduct();
  return product.custom ? <CustomProduct productId={product.id} /> : <Template />;
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const init = useStore((s) => s.init);
  const layout = useStore((s) => s.layout);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleTheme]);

  return (
    <HashRouter>
      <DevHooks />
      <div className={`app${layout === 'pipeline' ? '' : ' stacked'}`}>
        {layout === 'pipeline' ? <Sidebar /> : <TopBar />}
        <Routes>
          <Route path="/" element={layout === 'board' ? <Board /> : layout === 'focus' ? <Focus /> : <Overview />} />
          <Route path="/p/:productId" element={<ProductGate />}>
            <Route path="queue" element={<Queue />} />
            <Route path="review" element={<Review />} />
            <Route path="review/:key" element={<Review />} />
            <Route path="print" element={<PrintLayout />} />
            <Route path="print/:key" element={<PrintLayout />} />
            <Route path="print-batch" element={<BatchPrint />} />
            <Route path="template" element={<TemplateRoute />} />
          </Route>
          <Route path="/unassigned" element={<Unassigned />} />
          <Route path="/add-product" element={<AddProduct />} />
          <Route path="/crop-export" element={<CropExport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <PrintRoot />
    </HashRouter>
  );
}
