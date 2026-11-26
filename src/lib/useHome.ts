import { useStore } from '../store';
import { homeFor } from './layout';

/** Back target for the current layout (see homeFor). */
export function useHome(productId: string) {
  const layout = useStore((s) => s.layout);
  return homeFor(layout, productId);
}
