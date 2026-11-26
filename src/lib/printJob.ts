import { create } from 'zustand';
import type { SheetModel } from './sheets';
import type { TemplateDescriptor } from './geometry';

/** The sheets currently mounted in the hidden print root, plus which orders they belong to. */
interface PrintJobState {
  sheets: SheetModel[];
  orderKeys: string[];
  /** template to print with; absent = the Instant Photo Prints template */
  template?: TemplateDescriptor;
  /** set after the browser print dialog closes so the UI can offer "mark printed" */
  awaitingConfirm: boolean;
  setJob(sheets: SheetModel[], orderKeys: string[], template?: TemplateDescriptor): void;
  setAwaitingConfirm(v: boolean): void;
  clear(): void;
}

export const usePrintJob = create<PrintJobState>((set) => ({
  sheets: [],
  orderKeys: [],
  awaitingConfirm: false,
  setJob: (sheets, orderKeys, template) => set({ sheets, orderKeys, template }),
  setAwaitingConfirm: (v) => set({ awaitingConfirm: v }),
  clear: () => set({ sheets: [], orderKeys: [], template: undefined, awaitingConfirm: false }),
}));

export function printSheets(sheets: SheetModel[], orderKeys: string[], template?: TemplateDescriptor) {
  usePrintJob.getState().setJob(sheets, orderKeys, template);
  // let React mount the print root before opening the dialog
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}
