# Tracking Labels & Hover Tooltips — Design

**Branch:** `feature/rk78-cowell`
**Date:** 2026-06-15

## Goal

Label the scene's elements (synthetic satellites, live satellites, ground
points) with a **minimal name tag by default that follows the element as it
moves**, expanding to a **detail card on hover**. Decluttered so large fleets
stay readable.

## Decisions (brainstorming)

| Q | Choice |
|---|---|
| Default state | Minimal name label per element, **shown only for the nearest N** to the camera (declutter); hover expands. |
| Tracking | Labels are HTML pills projected from each element's world position **every frame**, so they ride the moving points. |
| Hover | `mouseenter`/`mouseleave` on the pill toggles an expanded detail card (data built on demand). |
| Elements | Synthetic sats, live sats, ground points (all pages). |

## Data

- **Satellite** — name; expanded: a, e, i, period, current altitude.
- **Ground point** — label; expanded: lat/lon, FOV half-angle, # sats currently in its cone.
- **Live satellite** — name; expanded: NORAD id, current altitude.

## Architecture

- `src/labels.js` (new): `createLabelOverlay({ container, camera, canvas, groups,
  maxLabels })` → `{ update(), dispose() }`. `groups` is an array of stable
  target arrays. Each target: `{ getWorldPosition(out), name, details() ->
  htmlString }`. Per frame `update()`:
  - project each target (reuse one Vector3); skip if behind camera/off-screen;
    record camera distance;
  - show the nearest `maxLabels`; hide the rest (always keep a hovered pill);
  - one stable pill `<div>` per target (Map keyed by target) so hover identity
    is stable; position via `left/top` + a CSS `translate(-50%,…)` offset.
  - container is `pointer-events:none`; pills are `auto` (so OrbitControls keeps
    working everywhere else).
- Target providers (cached arrays, rebuilt on add/remove — no per-frame alloc):
  - `groundPoints.getLabelTargets()` — apex world pos; details read the cone's
    live `count`.
  - `syntheticSats.getLabelTargets()` — field position; details from
    `orbit.elements` + current altitude.
  - live: a cached array in `main.js`, refreshed on track/untrack.
- `visibility.js`: also tally a per-cone `count` (each cone-state gets `count`
  reset to 0 then incremented), so ground-point cards can show "N in view".
- HTML: a `#labels` overlay div over the canvas on both pages; CSS for `.lbl`
  pill + `.lbl-details`. `main.js`/`moonMain.js` build the groups, create the
  overlay (needs `camera`), and call `update()` each frame.

## Verification

- `npm test` green (no physics change); `npm run build` clean.
- Both pages: name labels follow moving satellites and rotating ground points;
  only the nearest ~N show; hovering a pill expands it with the right data;
  OrbitControls still works; 0 console errors.

## Out of scope

- Click-to-pin/select; label collision avoidance beyond nearest-N; leader lines.
