import { useRef, useState } from 'react';
import { useStore } from '../store';

/** Drop zone + import progress list. Shared by every layout; `compact` drops the helper text. */
export function ImportDrop({ compact = false, title = 'Drop Amazon order zips' }: { compact?: boolean; title?: string }) {
  const importFiles = useStore((s) => s.importFiles);
  const importQueue = useStore((s) => s.importQueue);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = importQueue.some((q) => q.state === 'decoding' || q.state === 'queued');
  const doneCount = importQueue.filter((q) => q.state === 'done' || q.state === 'skipped').length;

  return (
    <div className={`import-drop${compact ? ' compact' : ''}`}>
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          void importFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="icon">↓</div>
        <div className="t">{title}</div>
        {!compact && <div className="s">One zip per order item. Click to browse. Nothing leaves this machine.</div>}
        <input
          ref={fileRef}
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
      </div>

      {importQueue.length > 0 && (
        <div className="import-progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="card-title">Importing</span>
            <span className="mono faint">{doneCount} of {importQueue.length}</span>
          </div>
          <div className="progress-track" style={{ marginBottom: 10 }}>
            <div className="progress-fill" style={{ width: `${(doneCount / Math.max(1, importQueue.length)) * 100}%` }} />
          </div>
          <div className="import-list">
            {importQueue.map((q) => (
              <div key={q.fileName} className={`import-item${q.state === 'error' ? ' err' : ''}`}>
                {q.state === 'done' ? <span className="ok-mark">✓</span>
                  : q.state === 'skipped' ? <span className="faint">=</span>
                  : q.state === 'decoding' ? <span className="spin" />
                  : q.state === 'error' ? <span>×</span>
                  : <span className="faint">○</span>}
                <span className="nm">{q.fileName}</span>
                <span className="st">
                  {q.state === 'done' || q.state === 'skipped' ? q.detail : q.state === 'decoding' ? q.detail ?? 'decoding' : q.state}
                </span>
              </div>
            ))}
          </div>
          {!busy && (
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => useStore.setState({ importQueue: [] })}>
              Clear list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
