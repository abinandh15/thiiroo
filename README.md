# Thiiroo Dashboard

Local-first production dashboard for Amazon custom photo orders. Phase 1: the **Instant Photo Prints** product — import Amazon customization zips, review every buyer crop, lay them out on the physical A4 template, and batch-print at exact size.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

Everything runs in the browser; orders persist in IndexedDB. Nothing leaves the machine.

## Flow

1. **Queue** — drop one or many order zips (Seller Central → Manage Orders → Customization Info → Download).
2. **Review** — every order is gated here; compare each crop against the buyer snapshot, re-frame (drag/zoom/rotate) if needed, approve.
3. **Print layout / Batch print** — sheets follow the extracted Illustrator template (A4 landscape, six 3″×4″ polaroids, 69.8×82.5 mm photo areas, grey cut bars, crop marks, order ID in the right margin). Print via Ctrl+P (margins None, scale 100%, background graphics ON) or Export PDF.

## Key modules

- `src/lib/zip.ts` — dependency-free zip read/write (DecompressionStream)
- `src/lib/ingest.ts` — Amazon order JSON walker + crop pipeline (EXIF-oriented, verified against Amazon's own SVG/snapshot)
- `src/lib/geometry.ts` — the physical template in mm (single source of truth)
- `src/lib/sheets.ts` — sheet packing (strict per-order / combine part sheets)
- `src/components/Sheet.tsx` — renders the sheet at any px/mm scale or in true mm for print
- `src/store.ts` — zustand store, IndexedDB persistence in `src/lib/persist.ts`

## Testing

`node e2e-check.mjs <outDir>` (dev server must be running) — imports `public/sample-order.zip` (gitignored; drop any real order zip there), walks every screen, screenshots them, and exports the print PDF for dimensional checks.

Dev-only URL hooks: `?sample=1` import sample, `?approveall=1`, `?printtest=1` mount print sheets.

## Roadmap

- Phase 2: more products as pluggable pages; template editor.
- Phase 3: SP-API backend (order inbox, auto-download, mark shipped). Zip drop stays as fallback.
