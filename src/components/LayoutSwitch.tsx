import { useStore } from '../store';
import { LAYOUTS } from '../lib/layout';

/** Segmented control that switches the app shell. Persists in localStorage via the store. */
export function LayoutSwitch() {
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  return (
    <div className="seg layout-switch" role="group" aria-label="Layout">
      {LAYOUTS.map((l) => (
        <button key={l.id} className={layout === l.id ? 'on' : ''} title={l.hint} onClick={() => setLayout(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
