import { useRef } from 'react';
import type { OrderStatus } from '../lib/types';
import { useStore } from '../store';

export function StatusPill({ status, extra }: { status: OrderStatus; extra?: string }) {
  const map: Record<OrderStatus, { cls: string; label: string }> = {
    importing: { cls: 'accent', label: 'Importing' },
    needs_review: { cls: 'attention', label: 'Needs review' },
    ready: { cls: 'ready', label: 'Ready' },
    printed: { cls: 'accent', label: 'Printed' },
    done: { cls: 'neutral', label: 'Done' },
    held: { cls: 'held', label: 'On hold' },
    error: { cls: 'error', label: 'Error' },
  };
  const m = map[status];
  return (
    <span className={`pill ${m.cls}`}>
      <span className="dot" />
      {m.label}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggle = useStore((s) => s.toggleTheme);
  return (
    <div className="theme-toggle" title="⌘⇧L">
      <button className={theme === 'light' ? 'on' : ''} onClick={() => theme !== 'light' && toggle()}>
        LIGHT
      </button>
      <button className={theme === 'dark' ? 'on' : ''} onClick={() => theme !== 'dark' && toggle()}>
        DARK
      </button>
    </div>
  );
}

export function ImportButton({ className = 'btn primary' }: { className?: string }) {
  const importFiles = useStore((s) => s.importFiles);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>
        Import zips
      </button>
      <input
        ref={ref}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void importFiles(files);
        }}
      />
    </>
  );
}
