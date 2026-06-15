# Performance: Many Satellites — Design (Phase 2)

**Branch:** `feature/perf-many-satellites`
**Date:** 2026-06-15

## Goal

Make the scene handle hundreds–thousands of synthetic satellites smoothly. Two
costs scale with satellite count `N` today; both are fixed here:

1. **Draw calls** — each satellite is a Group with an orbit `Line`, a dot
   `Mesh`, and a glow `Mesh` ⇒ ~`3N` draw calls.
2. **Per-frame allocation / GC** — `groundPoints.getConeStates()` allocates
   objects + vectors every frame; `syntheticSats.getTargets()` builds a fresh
   array of closures every frame; `runVisibility` spreads them into a new array.

No behavior changes: same orbits, same visibility highlighting, same UI.

## Changes

### Instanced rendering — `src/satelliteField.js` (new)

One module owns the instanced visuals + propagation for the whole synthetic set:

- **Dots + glows**: two `THREE.InstancedMesh` (sphere) — one draw call each for
  all satellites. Per-instance translation+scale (matrix) and color
  (`instanceColor`).
- **Orbit lines**: a single merged `LineSegments` with per-vertex colors — one
  draw call for all ellipses. Rebuilt only when the set changes (a `dirty`
  flag flushed once per frame), never per-frame, since orbits are fixed in the
  inertial frame.
- **Slots + free-list**: each satellite keeps a stable instance index for its
  lifetime; removal frees the slot (no index reshuffle). Capacity grows ×2 by
  recreating the InstancedMeshes when exceeded.
- `tick(simSec)` writes each active orbit's scene position into a flat
  `Float32Array` (used directly by visibility — `satellitesRoot` has no
  transform, so local == world) and into the dot/glow instance matrices.
- `setHighlighted(i, on)`, `getPosition(i, out)`, `count`, `dispose`.

`satellite.js` (per-object renderer) is removed; its `pointInsideCone` moves
into `visibility.js` (its only consumer).

### Allocation-free hot path

- **`groundPoints.js`**: cache one cone-state object (with reused `Vector3`s)
  per point, rebuilt on add/remove; `getConeStates()` updates apex/axis
  **in place** each frame and returns the cached array.
- **`syntheticSats.js`**: keep a cached `targets` array (lightweight objects
  that read positions from the field by index), rebuilt on add/remove only.
- **`visibility.js`**: `updateVisibility(coneStates, targetGroups)` — accepts
  an array of target arrays so synthetic + live groups are tested without
  merging into a new array each frame. Resets cones once, then iterates groups.
- **`main.js` / `moonMain.js`**: cache the live-targets array (rebuilt on
  track/untrack) and pass a stable `[syntheticTargets, liveTargets]` grouping.

### Bench hook

`window.__app.addRandomSats(n)` / `window.__moon...` — add `n` random valid
orbits, for measuring. Not surfaced in the UI.

## Verification

- `npm test` still green (orbit math untouched).
- `npm run build`, both pages, no errors.
- **Draw calls**: `renderer.info.render.calls` stays roughly flat as `N` grows
  (instanced) instead of ~`3N`. Measure at N = 1 and N = 500.
- **Update cost**: time `tick + visibility` over many iterations at N = 500;
  confirm it's allocation-light (stable) and well under a frame budget.
- Behavior intact: all three add modes, presets, live tracking, view-cone
  highlighting, both pages; 0 console errors.

## Out of scope

- Spatial broad-phase for visibility (linear scan is fine at these N with the
  allocation fixes); LOD; worker-thread propagation.
