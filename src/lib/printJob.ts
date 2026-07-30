import { create } from 'zustand';
import type { SheetModel } from './sheets';

/** The sheets currently mounted in the hidden print root, plus which orders they belong to. */
interface PrintJobState {
  sheets: SheetModel[];
  orderKeys: string[];
  /** set after the browser print dialog closes so the UI can offer "mark printed" */
  awaitingConfirm: boolean;
  setJob(sheets: SheetModel[], orderKeys: string[]): void;
  setAwaitingConfirm(v: boolean): void;
  clear(): void;
}

export const usePrintJob = create<PrintJobState>((set) => ({
  sheets: [],
  orderKeys: [],
  awaitingConfirm: false,
  setJob: (sheets, orderKeys) => set({ sheets, orderKeys }),
  setAwaitingConfirm: (v) => set({ awaitingConfirm: v }),
  clear: () => set({ sheets: [], orderKeys: [], awaitingConfirm: false }),
}));

export function printSheets(sheets: SheetModel[], orderKeys: string[]) {
  usePrintJob.getState().setJob(sheets, orderKeys);
  // let React mount the print root before opening the dialog
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}
