/** Dependency-free zip reader (STORED + DEFLATE via DecompressionStream) and STORED zip writer. */

export interface ZipArchive {
  names: string[];
  extract(name: string): Promise<Uint8Array | null>;
}

export async function readZip(arrayBuffer: ArrayBuffer): Promise<ZipArchive> {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid zip file (no end-of-central-directory record).');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; compSize: number; localOffset: number }>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  async function extract(name: string): Promise<Uint8Array | null> {
    const e = entries.get(name);
    if (!e) return null;
    const lh = e.localOffset;
    if (view.getUint32(lh, true) !== 0x04034b50) throw new Error('Corrupt zip local header for ' + name);
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const start = lh + 30 + nameLen + extraLen;
    const data = bytes.subarray(start, start + e.compSize);
    if (e.method === 0) return new Uint8Array(data);
    if (e.method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error(
      'Compressed with an unsupported method (' + (e.method === 9 ? 'deflate64' : 'method ' + e.method) +
      '). Re-download from Seller Central.'
    );
  }
  return { names: [...entries.keys()], extract };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildStoredZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    parts.push(lh.buffer, nameBytes, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, nameBytes);
    offset += 30 + nameBytes.length + f.data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += (c as ArrayBuffer | Uint8Array).byteLength;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' });
}
