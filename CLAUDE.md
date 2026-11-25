# Thiiroo Dashboard — project context

Production dashboard for Thiiroo (Amazon India seller, merchant A3K5KSR5J1JHDD) that turns Amazon
customization order zips into ready-to-print A4 sheets. Owner: Abinandh (senior frontend engineer).

## Handoff — read this first (written 2026-11-25, when work moved to another machine)

**Where the code is.** Latest work is on branch `feature/add-product` (pushed to
`github.com/abinandh15/thiiroo`), with `origin/main` already merged in. No PR is open yet; `main`
on GitHub does not have it. Start with `git checkout feature/add-product && npm install`.

**What that branch adds on top of `main`** (details in the dated notes further down):
1. Pack sizes — all five photo-print ASINs in the registry; Queue/Review show "pack of N" and warn
   on a photo-count mismatch or unknown ASIN.
2. Add product — `/add-product` turns a template SVG into a saved custom product.

**Next step, agreed in direction but not started:** route orders to custom (SVG-built) products.
Today Queue/Review/PrintLayout/BatchPrint/PrintRoot import `instantPhotoPrints` directly, about 15
navigations hardcode `/p/instant-photo-prints/...`, `sheets.ts` and `store.ts` use
`SLOTS_PER_SHEET` (6), and `printDpi` uses `PHOTO.w`. The plan: resolve an order's product with
`findByAsin(order.asin)`, filter each product's Queue by it, take slots-per-sheet and photo width
from the product's template (`slotsPerSheet(t)` already handles `template.custom`), build one batch
per product, and pass the product's template into the print job (`printSheets(…, template)` already
accepts one and sets `@page` to the sheet size).

**Open questions — ask Abinandh, do not assume:**
- Does a 12/18/24/30-pack zip really contain that many photo placements? Only a 6-pack zip has ever
  been seen. If Amazon sends fewer, the pack-mismatch warning is wrong for every large-pack order.
- Add product has only been tested with a synthetic photo-strip SVG (4 strips × 4 frames). A real
  Illustrator export from Abinandh has not been tried; he was asked for one.
- Name labels (below) need a real order zip and the print sheet before anything can be built.
- Nothing from this branch has been printed on paper.

**The Amazon storefront, as browsed 2026-11-13** (store page 9E1B862E-C894-4FB4-A6F6-13F20DDCCCD8):
- Custom Photo — Instant Photo Style Prints 4×3 in, customised (photo upload). Pack → ASIN:
  6 `B0HB4CYFG3`, 12 `B0HB5VZ67B`, 18 `B0HB5MTKDP`, 24 `B0HB5KK63G`, 30 `B0HB5YQPCZ`.
- Name Labels — 40 waterproof labels, 6.4×2 cm, customised (name + font), 9 styles:
  Space-1 `B0FHRFZ1MJ`, Space-2 `B0FHVSQ8CV`, Cute Animals-1 `B0FHVZ6N8Z`, Cute Animals-2
  `B0FHVP9DMT`, WC Animals-1 `B0FHVVJ9S4`, WC Animals-2 `B0FHVVPPRD`, combos: Cute Animals
  `B0FHVVMMT7`, Space `B0FHVNZD8B`, WC Animals `B0FHVSZHLS`. Not in the app. This is a text
  product (name over themed artwork), so it needs a different template kind than a photo crop;
  the "Customise now" fields were not inspected (needs sign-in).
- Business Stickers — Thank You strip/round and "Handmade with Love". Fixed designs, plain
  add-to-cart, nothing per-order to generate; the dashboard does not need them.
- Abinandh's stated goal: "make my life easier, to build templates and fulfill orders" across
  the shop, photo strips being the example he gave for a new product.

**Does not travel with git** (lives only on the first machine unless copied by hand):
`public/sample-order.zip` (real buyer data — needed for `?sample=1` and the e2e check), the
Phase 3 `.env`, the design handoff folder referenced under Conventions, the Illustrator reference
`1.pdf`, and all browser data (imported orders in IndexedDB; template overrides and custom products
in localStorage). There is no export/import for browser data yet.

**Machine notes.** Node 20.12.x is why Vite is pinned to v5. `.claude/launch.json` defines the
`dashboard` dev server (port 5173) for the Claude preview pane. On the first machine `gh` was
logged in as a different account with a bad token; plain `git push` over HTTPS worked. Console
500s on `/api/status` just mean the Phase 3 backend (`npm run server`) is not running.

## Model routing — delegate by task, don't do everything on the session model

The session model cannot switch itself mid-task; routing happens by handing work to the
project agents in `.claude/agents/`, each pinned to the model that suits it. Pick by what the
task needs, not by its size:

| Task | Agent | Model | Why |
| --- | --- | --- | --- |
| Find code, list usages, summarize a file/diff/log | `scout` | Haiku | Fast and cheap; no judgment needed |
| Type-check, build, e2e run | `checker` | Haiku | Mechanical; reports output verbatim |
| Well-specified UI/CSS/wiring/refactor that follows an existing pattern | `builder` | Sonnet | Strong everyday coding at lower cost |
| Crop math, mm geometry, SVG parsing, sheet packing, status machine, persistence, SP-API — design, review or root-cause | `print-engineer` | Opus | Deep reasoning where a wrong number wastes paper |

Rules:
- Stay in the main session for conversation, planning, one-file edits and anything a
  handful of tool calls settles — a hand-off costs more than it saves there.
- Changes to `geometry.ts`, `ingest.ts`, `sheets.ts`, `svgTemplate.ts`, `Sheet.tsx` or
  `recomputeStatus` get a `print-engineer` review before commit.
- A feature that is part plumbing, part print logic is split: `print-engineer` designs the
  risky part, `builder` implements the rest, `checker` verifies.
- Independent pieces go out in parallel in one message. Never give two agents the same files.
- An agent's report is not proof: read the diff before telling Abinandh it is done.
- Browser checks (preview pane) stay in the main session — the agents do not drive it.

## State (Phase 1 + polish + Phase 2 complete, verified end-to-end 2026-07-30)

Vite + React 18 + TS + zustand + idb + react-router (HashRouter). Local-first; IndexedDB persistence;
no backend in the core flow (Phase 3 proxy is optional). Node on the original machine is 20.12.1 — that's why Vite is pinned to v5 (Vite 7+ needs newer Node).

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
- `src/products/index.ts` — registry: `BUILTIN_PRODUCTS` (`instant-photo-prints`, with one
  `variants` entry per pack-size ASIN) + custom products from localStorage; `listProducts()`,
  `getProduct()`, `findByAsin()`, `packSizeOf()`, `packWarning()`, `newProductId()`.
- `src/lib/svgTemplate.ts` — SVG → template: `parseSvgTemplate()`, `rescale()`, `orderedPhotos()`,
  `buildTemplate()`.
- `src/lib/zip.ts` — dependency-free zip read/write (DecompressionStream).
- `src/lib/ingest.ts` — order JSON walker + crop pipeline (EXIF-oriented).
- `src/lib/geometry.ts` — mm template constants + `TemplateDescriptor`, `deriveWaste()`, `slotRect()`, `printDpi()`.
- `src/lib/sheets.ts` — sheet packing (`strict` per-order / `combine` part sheets).
- `src/lib/persist.ts` — IndexedDB (idb): orders + activity log (last 30 shown).
- `src/components/Sheet.tsx` — renders a sheet at any px/mm scale or true mm for print;
  `PrintRoot.tsx` mounts print-only DOM driven by `src/lib/printJob.ts`.
- Screens: `Overview` (stats + activity), `Queue` (drop zone, rows/cards), `Review`, `PrintLayout`,
  `BatchPrint`, `Template` (live editor, built-in product only), `AddProduct` (`/add-product`),
  `CustomProduct` (`/p/:id/template` for SVG-built products).

## Conventions

- Commits are authored as `Abinandh <abinandh15@gmail.com>` (pass `--author`), no Claude
  co-author trailer.

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
- Remove order (done 2026-07-31): "Remove…" in the Queue selbar, window.confirm-gated; deletes
  the order AND its activity-log entries (state + IndexedDB; activity matches by orderId, so a
  multi-item order loses all its items' history). Re-import brings the order back as new.
- Review fine-nudge (done 2026-07-31): shift+arrows / on-screen pad move the image 1 design
  unit (~0.32 mm printed; shift+click pad = 5). Plain arrows still switch photos. Nudging
  re-crops and clears the photo's approval like any re-frame.
- Review fine-rotation (done 2026-07-31): `[` `]` keys / ⟲ angle° ⟳ stepper rotate 1°
  (shift = 5°) about the image centre; angle shown signed (-180…180]. cropPhoto always
  supported arbitrary angles, so pipeline unchanged. R (90°) still on top. Plus a hover
  rot-handle at the crop frame's top centre: drag swings around the frame centre, snaps
  to 0/90/180/270 within 2.5° (shift = free, 0.5° steps), commits on release.
- Cut guide lines (done 2026-07-31): new `cutLines` guide — 0.15 mm light-red (#f0a3a6)
  hairline TICKS at each row cut edge, drawn only in the bare outer margins (sheet edge →
  grey frame, both sides) — never across the print area; the grey bars themselves guide the
  vertical cuts. On by default, printed, toggleable in Print layout options. Order-id zone
  y=80 (was 53), font 4 mm (was 3). Grey bars darkened (#d4d1cc / #d8d5d0, were #e6e4e0/#eeece8).
- Zoom value editable (done 2026-07-31): the stepper readout is an input — type an exact
  ratio (rel. to buyer scale), Enter/blur applies, Escape reverts (via ref flag: escape's
  blur fires before the draft-state reset lands), garbage ignored. zoomTo keeps the
  crop-window centre fixed.
- Phase 2 (done): `src/products` registry (id/name/ASIN/size/template) drives routes + sidebar;
  `TemplateDescriptor`/`DEFAULT_TEMPLATE` in geometry.ts; `deriveWaste()` rebuilds cut bars from
  card geometry (exact vs Illustrator); Template screen is a live editor, overrides persisted per
  product in localStorage (`thiiroo-template-overrides`) via `effectiveTemplate()`.

- Pack sizes (done 2026-11-25): `Product.variants` lists every child ASIN with its pack size.
  Pack size is derived from the order's stored ASIN at render time (not stored on the order), so
  old orders get it too. `packWarning()` feeds a warn line in Queue rows/cards and Review, and
  is also pushed into `order.warnings` at import.
- Add product (done 2026-11-25, template only): `/add-product` takes a template SVG; `src/lib/svgTemplate.ts`
  measures every shape ≥5 mm in the browser (getBBox + CTM, so transforms/paths work), guesses roles
  (photo frame / cut outline / ignored) from nesting, and the user corrects them by clicking. Saved as a
  custom `Product` (`custom: true`, `template.custom` = free-form `CustomLayout`) in localStorage
  (`thiiroo-custom-products`); `Sheet.tsx` renders `template.custom` when present. Unitless SVGs are
  read as 72/in (Illustrator) unless they match a paper size at 96/in.
  Role guessing: a shape that contains others = cut outline, shapes inside one = photo frame,
  the rest ignored; a shape's own id/data-name can override (photo/cut/guide keywords), a layer
  name only when geometry is silent. Click cycles the role for every shape of that size, alt-click
  for one. Fill order = cut pieces in reading order, frames within each piece in reading order.
  Scripts, foreignObject and on* attributes are stripped before the SVG is mounted or stored.
  Artwork over ~1.5 MB is not stored (layout only). In `Sheet.tsx` the custom cut outline class is
  `.cutbox` — `.cutline` belongs to the red cut-guide ticks.
- NOT done: orders are not routed to custom products. Queue/Review/Print, `sheets.ts`
  (`SLOTS_PER_SHEET`) and `printDpi` are still hardwired to Instant Photo Prints.

## Phase 3 — SP-API (in progress, started 2026-07-31)

- `server/index.mjs`: zero-dep Node proxy (`npm run server`, port 3001, reads `.env` via
  `node --env-file`). LWA token exchange w/ cache; endpoints: `/api/status` (probes a minimal
  Orders call, always HTTP 200 with `{state}`), `/api/orders`, `/api/orders/:id/items` (incl.
  `customizedUrl` = the same zip as manual download), `/api/customization?url=` (Amazon-hosts only).
  No AWS SigV4 needed (dropped by Amazon Nov 2023); India marketplace `A21TJRUUN4KGV`, EU endpoint.
- `.env` (gitignored): LWA_CLIENT_ID / LWA_CLIENT_SECRET / LWA_REFRESH_TOKEN. App
  `amzn1.sp.solution.f16060ef-ee3f-4c39-bcb9-737a0ca68e4f`, secret rotation deadline 2027-01-27.
  Secret was pasted in chat 2026-07-31 — rotate once stable.
- Vite dev proxy `/api` → 3001; sidebar card polls `/api/status` every 30 s
  (offline / setup / authorize / error / connected — offline is normal, not an error).
- BLOCKED (pending verification by Abinandh): SP-API returns 403 "Access denied" on Orders even
  though LWA token exchange succeeds. Likely cause: the `.env` values are the SANDBOX LWA pair
  (owner suspects this too). Fix: Developer Central → app row → "LWA credentials → View"
  (production, NOT "View sandbox credentials") + Authorize → production refresh token → update
  `.env`, restart `npm run server`. If still 403 after that, check app roles ("Inventory and
  Order Tracking") and regenerate the token — roles are baked in at generation time.
  `SPAPI_SANDBOX=1` switches the server to the sandbox endpoint for canned-data testing.
- Next once unblocked: orders inbox panel in Queue (list SP-API orders, one-click fetch of
  customization zips into the existing `importFiles` pipeline); manual drop stays as fallback.
