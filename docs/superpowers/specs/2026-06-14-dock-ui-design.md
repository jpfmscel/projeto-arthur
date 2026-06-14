# Dock UI — Design

**Branch:** `feature/ux-ui-overhaul`
**Date:** 2026-06-14

## Goal

Replace the right-side control panel on both pages with a macOS-style,
bottom-center **liquid-glass dock** that manages the scene's objects. Tapping a
dock tile raises a frosted **glass sheet** above the dock containing that
category's existing form + list. The 3D scene fills the whole screen behind the
glass.

## Decisions (locked in via brainstorming + visual companion)

| Q | Choice |
|---|---|
| Reveal style | **B · slide-up glass sheet** (roomy, most "liquid glass") |
| Icon style | **Emoji glyphs** |
| Dock contents | **Object categories + Simulation only.** Help → small corner "?" FAB; Earth⇄Moon nav → small floating pill (not a dock tile) |

## Dock tiles (per page)

- **Earth** (`index.html`): 📍 Locations · 🛰️ Satellites · 📡 Live · ⚙️ Simulation
- **Moon** (`moon.html`): 📍 Locations · 🛰️ Satellites · 🪐 Presets · ⚙️ Simulation

## Architecture (SRP / DRY)

One shared, declarative component drives both pages.

- **`src/dock.js`** (new) — single responsibility: dock behavior. Given a dock
  element and a sheet element, it scans the sheet for `[data-dock-panel]`
  sections, builds one tile per panel from its `data-dock-icon` /
  `data-dock-label`, and manages: open/close, active tile, content swap, hover
  magnify (CSS), `Esc`-to-close, click-outside-to-close. Exposes
  `createDock({ dockEl, sheetEl })`.
- **HTML is declarative** — each page keeps its category sections but marks them
  `data-dock-panel data-dock-icon="…" data-dock-label="…"` and nests them inside
  the sheet. **All existing form/list element IDs are preserved**, so
  `main.js` and `moonMain.js` logic is untouched — the markup just moves from
  the old `<aside>` into dock-managed panels.
- **`src/style.css`** (shared) — glass dock, glass sheet, floating nav pill,
  help FAB/popover, full-screen canvas.

This keeps dock logic in exactly one place (no per-page copy) and carries zero
risk to the existing object-management logic.

## Behavior

- Start closed: just the dock over the full-screen scene.
- Tile click: sheet closed → open with that panel (tile active, lifted, dot).
  Open + same tile → close. Open + different tile → swap content.
- `Esc` or click outside dock+sheet → close.
- Tiles magnify + lift on hover (CSS `:hover`); active tile stays lifted.

## Layout / styling

- `#scene` becomes a full-screen fixed canvas (the `#app` grid is removed).
- `.dock` — fixed bottom-center, `backdrop-filter: blur()+saturate`, rounded,
  subtle border + shadow; row of `.dock-tile` emoji buttons.
- `.dock-sheet` — fixed, centered just above the dock, glass, `width:
  min(560px, 92vw)`, `max-height: 60vh`, scrollable; slide-up + fade
  transition. Body holds the `[data-dock-panel]` sections (one visible at a
  time); existing `#points` / `#satellites` / form styles apply inside.
- `.page-nav` — small floating glass pill, top-left.
- `.help-fab` (`?`) + `.help-popover` — bottom-left corner; popover holds the
  former "Controls & conventions" list.
- Existing `@media (max-width:720px)` panel rule is replaced by dock-friendly
  responsive sizing (sheet ~full-width on narrow screens).

## Out of scope (this step)

- Changing object behavior, the 3D scene, or any `main.js`/`moonMain.js` logic.
- Click-to-place / raycaster interactions (future overhaul step).

## Verification

- Both pages: dock renders the right tiles; each tile opens its sheet with the
  working form + list; add/remove still works; Earth live tracking + Moon
  presets intact; `Esc`/outside/again all close; nav pill switches pages.
- `npm run build` emits both pages with no errors; headless screenshot of each.
