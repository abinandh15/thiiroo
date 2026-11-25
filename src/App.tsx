import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PrintRoot } from './components/PrintRoot';
import { Overview } from './screens/Overview';
import { Queue } from './screens/Queue';
import { Review } from './screens/Review';
import { PrintLayout } from './screens/PrintLayout';
import { BatchPrint } from './screens/BatchPrint';
import { Template } from './screens/Template';
import { BUILTIN_PRODUCTS } from './products';
import { AddProduct } from './screens/AddProduct';
import { CustomProduct } from './screens/CustomProduct';

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
        const ready = os.filter((o) => o.status === 'ready' || o.status === 'printed' || o.status === 'done');
        usePrintJob.getState().setJob(buildSheets(ready, combineMode), []);
      }
    })();
  }, [loaded]);
  return null;
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const init = useStore((s) => s.init);
  const customProducts = useStore((s) => s.customProducts);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
      <div className="app">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Overview />} />
          {BUILTIN_PRODUCTS.map((p) => (
            <Route key={p.id} path={`/p/${p.id}`}>
              <Route path="queue" element={<Queue />} />
              <Route path="review" element={<Review />} />
              <Route path="review/:key" element={<Review />} />
              <Route path="print" element={<PrintLayout />} />
              <Route path="print/:key" element={<PrintLayout />} />
              <Route path="print-batch" element={<BatchPrint />} />
              <Route path="template" element={<Template />} />
            </Route>
          ))}
          {customProducts.map((p) => (
            <Route key={p.id} path={`/p/${p.id}/template`} element={<CustomProduct productId={p.id} />} />
          ))}
          <Route path="/add-product" element={<AddProduct />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <PrintRoot />
    </HashRouter>
  );
}
