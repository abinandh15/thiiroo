import { useEffect } from 'react';
import { usePrintJob } from '../lib/printJob';
import { useStore } from '../store';
import { Sheet } from './Sheet';

/** Hidden on screen; the only thing visible to the printer. */
export function PrintRoot() {
  const { sheets, orderKeys, awaitingConfirm, setAwaitingConfirm, clear } = usePrintJob();
  const guides = useStore((s) => s.guides);
  const markPrinted = useStore((s) => s.markPrinted);

  useEffect(() => {
    const onAfter = () => {
      if (usePrintJob.getState().sheets.length) setAwaitingConfirm(true);
    };
    window.addEventListener('afterprint', onAfter);
    return () => window.removeEventListener('afterprint', onAfter);
  }, [setAwaitingConfirm]);

  return (
    <>
      <div className="print-root">
        {sheets.map((m, i) => (
          <Sheet key={i} model={m} unit="mm" guides={{ ...guides, slotNumbers: false }} />
        ))}
      </div>
      {awaitingConfirm && (
        <div className="confirm-bar screen-only">
          <span>
            Sent {sheets.length} sheet{sheets.length !== 1 ? 's' : ''} to the printer.
          </span>
          <button
            className="btn sm white"
            onClick={() => {
              markPrinted(orderKeys, false);
              clear();
            }}
          >
            Mark {orderKeys.length} order{orderKeys.length !== 1 ? 's' : ''} printed
          </button>
          <button className="btn sm" onClick={() => window.print()}>
            Reprint
          </button>
          <button className="btn sm" onClick={clear}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
