export function timeHM(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function headerStamp(): string {
  const d = new Date();
  const day = d.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });
  return `${day} · ${timeHM(d.getTime())}`;
}

export function truncateMiddle(s: string, max = 18): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + '…' + s.slice(-half);
}

const urlCache = new Map<Blob, string>();
export function blobUrl(blob: Blob | undefined): string | undefined {
  if (!blob || blob.size === 0) return undefined;
  let u = urlCache.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    urlCache.set(blob, u);
  }
  return u;
}
