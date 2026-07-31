# Thiiroo Dashboard — project context

Production dashboard for Thiiroo (Amazon India seller, merchant A3K5KSR5J1JHDD) that turns Amazon
customization order zips into ready-to-print A4 sheets. Owner: Abinandh (senior frontend engineer).

## State (Phase 1 + polish + Phase 2 complete, verified end-to-end 2026-07-30)

Vite + React 18 + TS + zustand + idb + react-router (HashRouter). Local-first; IndexedDB persistence;
no backend yet. Node on this machine is 20.12.1 — that's why Vite is pinned to v5 (Vite 7+ needs newer Node).

Working flow: import zips → Queue → Review (hard approval gate, drag/zoom/rotate re-frame) →
Print layout / Batch print → browser print via mm-exact CSS (`@page 297mm 210mm`) or Save-as-PDF.
Verified: crops match Amazon's own snapshot/SVG; exported PDF matches the seller's Illustrator
template (`1.pdf` in Downloads) dimensionally.

## Domain facts (do not re-derive)

- Amazon zip: buyer JPGs (UUID names) + order JSON + Fabric.js SVG + 400×400 snapshot.
- Crop math: design canvas 400×400; crop window 219×260 @ (90,50); buyerPlacement {position=top-left
  of scaled image, dimension, scale, angleOfRotation}; srcRect = (cropRect − position) / scale.
- EXIF orientation MUST be applied before cropping (`createImageBitmap(…, {imageOrientation:'from-image'})`);
  Amazon's numbers are in orientation-applied space. Buyer files really do carry orientations 2/5/etc.
- Output crops: 1095×1300 px (219:260), JPEG q0.95. DPI floor for warnings: 150 (photo area is 69.8 mm wide).
- Physical template (mm, in `src/lib/geometry.ts` — single source of truth): A4 landscape 297×210;
  six 3″×4″ cards (76.2×101.6) at cols x=22.0/110.5/198.8, rows top y=3.4/105.0; photo area 69.8×82.5
  inset 3.2 (l/r/t), chin 15.9; grey cut bars; order ID rotated in right margin.

## Code map

- `src/App.tsx` — HashRouter; routes generated per product (`/p/:productId/{queue,review,print,print-batch,template}`);
  DevHooks reads the URL params below.
- `src/store.ts` — zustand store: orders, import queue with retry, selection, batch order,
  guides toggles, theme, template overrides. `orderKey(o)` = `id::itemId`. Status machine in
  `recomputeStatus` (`needs_review`/`ready` derived; `printed`/`done`/`held` sticky).
- `src/products/index.ts` — Phase 2 registry; single product so far (`instant-photo-prints`, ASIN B0HB4CYFG3).
- `src/lib/zip.ts` — dependency-free zip read/write (DecompressionStream).
- `src/lib/ingest.ts` — order JSON walker + crop pipeline (EXIF-oriented).
- `src/lib/geometry.ts` — mm template constants + `TemplateDescriptor`, `deriveWaste()`, `slotRect()`, `printDpi()`.
- `src/lib/sheets.ts` — sheet packing (`strict` per-order / `combine` part sheets).
- `src/lib/persist.ts` — IndexedDB (idb): orders + activity log (last 30 shown).
- `src/components/Sheet.tsx` — renders a sheet at any px/mm scale or true mm for print;
  `PrintRoot.tsx` mounts print-only DOM driven by `src/lib/printJob.ts`.
- Screens: `Overview` (stats + activity), `Queue` (drop zone, rows/cards), `Review`, `PrintLayout`,
  `BatchPrint`, `Template` (live editor).

## Conventions

- All sheet geometry authored in mm; `Sheet.tsx` renders at any px/mm or true mm for print.
- Design tokens/fidelity come from `../403-9409699-9386704_65793702893802/design_handoff_thiiroo_dashboard/README.md`
  (light "workshop" + dark "darkroom" themes; paper always #ffffff; amber reserved for attention).
- Review is a hard gate: status `ready` only when every non-missing photo is approved.
- Dev URL hooks (DEV only): `?sample=1` imports public/sample-order.zip (gitignored, contains real buyer
  data — never commit/deploy), `?approveall=1`, `?printtest=1`.
- E2E: `node e2e-check.mjs <outDir>` with dev server running (Playwright, channel:'chrome').
  Requires `public/sample-order.zip` (drop any real order zip there — it's not in git, so a fresh
  clone has neither the sample nor working `?sample=1` until one is added).

- Phase 1 polish (done): drag-to-swap slots on the print-layout sheet (persists photo order),
  Queue Rows/Cards toggle, batch page drag-to-reorder (print follows display order).
- Queue safety (done 2026-07-31): re-importing a zip whose `orderId::itemId` is already in the
  queue keeps the existing order and shows an amber banner (Replace anyway / Keep existing; the
  fresh parse is held in `duplicateImports` so replace needs no re-decode). "Reopen review"
  (Queue selbar + Print header) sends ready/printed/done orders back to `needs_review`,
  approvals kept. `init()` is guarded against StrictMode double-mount (stale-snapshot race).
- Phase 2 (done): `src/products` registry (id/name/ASIN/size/template) drives routes + sidebar;
  `TemplateDescriptor`/`DEFAULT_TEMPLATE` in geometry.ts; `deriveWaste()` rebuilds cut bars from
  card geometry (exact vs Illustrator); Template screen is a live editor, overrides persisted per
  product in localStorage (`thiiroo-template-overrides`) via `effectiveTemplate()`.

## Roadmap

- Phase 3: small Node backend for Amazon SP-API (LWA OAuth) — orders inbox replaces manual drop
  (drop stays as fallback). Sidebar "Amazon — not connected" card becomes connection status.
