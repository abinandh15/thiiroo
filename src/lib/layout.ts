/** The three interchangeable shells. The print/crop pipeline is identical in all of them;
 *  only navigation and the home screen differ. */
export type LayoutMode = 'pipeline' | 'board' | 'focus';

export const LAYOUT_LS_KEY = 'thiiroo-layout';
export const LAYOUTS: { id: LayoutMode; label: string; hint: string }[] = [
  { id: 'pipeline', label: 'Pipeline', hint: 'Sidebar + per-product queue with stage counters' },
  { id: 'board', label: 'Board', hint: 'All orders as cards in stage columns' },
  { id: 'focus', label: 'Focus', hint: 'One task at a time: the next thing to do' },
];

export function loadLayout(): LayoutMode {
  const v = localStorage.getItem(LAYOUT_LS_KEY);
  return v === 'board' || v === 'focus' ? v : 'pipeline';
}

/** Where "back" / "done" leads from Review and Print: the product queue in Pipeline, the home
 *  screen (board or workbench) in the other two. */
export function homeFor(layout: LayoutMode, productId: string): { path: string; label: string } {
  if (layout === 'board') return { path: '/', label: 'Board' };
  if (layout === 'focus') return { path: '/', label: 'Workbench' };
  return { path: `/p/${productId}/queue`, label: 'Queue' };
}
