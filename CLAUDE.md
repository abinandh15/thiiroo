# Thiiroo Dashboard — project context

Production dashboard for Thiiroo (Amazon India seller, merchant A3K5KSR5J1JHDD) that turns Amazon
customization order zips into ready-to-print A4 sheets. Owner: Abinandh (senior frontend engineer).

## State (Phase 1 complete, verified end-to-end 2026-07-30)

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

## Conventions

- All sheet geometry authored in mm; `Sheet.tsx` renders at any px/mm or true mm for print.
- Design tokens/fidelity come from `../403-9409699-9386704_65793702893802/design_handoff_thiiroo_dashboard/README.md`
  (light "workshop" + dark "darkroom" themes; paper always #ffffff; amber reserved for attention).
- Review is a hard gate: status `ready` only when every non-missing photo is approved.
- Dev URL hooks (DEV only): `?sample=1` imports public/sample-order.zip (gitignored, contains real buyer
  data — never commit/deploy), `?approveall=1`, `?printtest=1`.
- E2E: `node e2e-check.mjs <outDir>` with dev server running (Playwright, channel:'chrome').

## Roadmap

- Phase 1 polish: drag-to-swap slots, Cards view, batch page reorder (deferred from handoff).
- Phase 2: products as pluggable modules (id/name/ASIN/routes/template descriptor), template editor.
- Phase 3: small Node backend for Amazon SP-API (LWA OAuth) — orders inbox replaces manual drop
  (drop stays as fallback). Sidebar "Amazon — not connected" card becomes connection status.
