# Visualize Earth (3rd body) on the Moon page — Design

**Branch:** `feature/rk78-cowell`
**Date:** 2026-06-15

## Goal

Render Earth in the Moon-page scene so the third body you can already *feel*
gravitationally (Propagation → Third body: Earth) is also *visible*. Earth's
position comes from the same `ephemeris.thirdBodiesFor(MOON)` Earth function that
drives the perturbation, so marker and physics stay consistent.

## Decision (user picked option 3)

- **Marker by default**: a small Earth-textured sphere placed at a fixed scene
  distance in Earth's true *direction* (so it reads as "Earth is that way"),
  always reachable at the normal zoom.
- **"Show Earth to scale" toggle**: render Earth at its real distance
  (~384,400 km = ~221 Moon-radii) and real radius (~3.67 Moon-radii), and raise
  the camera's max zoom so you can pull back to frame the Earth–Moon system.

## Implementation

- `src/bodyMarker.js` (new, reusable): `createBodyMarker({ parent, positionAtKm,
  sceneScaleKm, realRadiusKm, texturePath, markerDistance, markerRadius })` →
  `{ mesh, update(simSec, toScale), dispose }`. Uses the satellites' ECI→scene
  swap `(x, z, −y)/sceneScaleKm`. In marker mode: position = unit(dir)·
  markerDistance, scale = markerRadius. In to-scale mode: position = real scene
  position, scale = realRadiusKm/sceneScaleKm. `MeshPhongMaterial` + the
  `earth_day` texture, lit by the scene's sun (shows a phase).
- `moonMain.js`: create the marker (parent = `scene`, the inertial frame) from
  the Earth third-body's `positionAt`; update it every frame (even when paused).
  A `#earthToScale` checkbox flips the mode and sets `controls.maxDistance`
  (20 ↔ 400). Needs `controls` from `createScene` and `EARTH` from bodies.
- `moon.html`: a "Show Earth to scale (zoom out)" checkbox in the Propagation
  panel, under `#prop-mount`.

Earth-page analog (showing the Moon) and a Sun marker are easy follow-ons but
out of scope here (user asked for Earth on the Moon page).

## Verification

- `npm test` still green (no physics change); `npm run build` clean.
- Moon page: Earth marker visible by default in the correct direction and moving
  over time; toggling "to scale" places Earth far out at real size and zoom-out
  works; toggling back restores the marker; 0 console errors.
