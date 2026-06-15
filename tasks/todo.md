# Projeto Arthur — Satellite Visibility Visualizer

## Goal
Interactive 3D Earth with ground stations (lat/lon + FOV cones) and
satellites in circular orbits. Show in real time which satellites are
inside which view cones.

## Stack
- Vite + Three.js + vanilla JS
- Self-hosted Earth textures (day / specular / normal / clouds) under `public/textures/`

## Completed

### v1 — ground points & cones
- [x] Vite + Three scaffold, OrbitControls, starfield, atmosphere shell
- [x] Earth body with real day texture, specular ocean shine, normal map, drifting clouds
- [x] `latLonToVec3(lat, lon, radius)` aligned to the equirectangular texture
- [x] `createViewCone({lat, lon, halfAngleDeg, color})` — apex on surface, axis along surface normal
- [x] UI to add/remove ground points

### v2 — satellites & rotating frame
- [x] `earthFrame` group: Earth body + clouds + ground points all rotate together at the configurable Earth-rotation rate
- [x] Satellites stay in the inertial world frame (so they sweep across rotating ground stations)
- [x] `createSatellite({altitude, inclinationDeg, raanDeg, omegaDegPerSec, alphaDegPerSec2, color})` — circular orbit, θ(t) = θ₀ + ωt + ½αt²
- [x] Per-frame visibility hit test (point-in-cone using axis dot-product); both satellite and the cone highlight when one's inside the other
- [x] UI for satellites (name, altitude, inclination, RAAN, ω, α), Earth rotation rate, pause, reset orbits
- [x] Seeded examples on load: 3 ground points + 3 satellites

## Review

Verified:
- `npm install` succeeds (vite + three only).
- `npm run build` succeeds — 10 modules, 508 KB bundle (mostly three.js).
- `npm run dev` serves index, all 5 ES modules, and all 4 textures with HTTP 200.

Not yet visually verified in a browser. Recommended sanity checks once running:
- London / São Paulo / Tokyo markers land on the right continents.
- Cones tilt with the Earth as it rotates (markers stay glued to the surface).
- Satellites move along their visible orbit rings; "ISS-ish" passes through cones every few seconds and lights up.
- Pause / Reset orbits / Earth rotation rate all behave.

## Trade-offs / known limitations
- Orbits are simple circles in a fixed inertial plane — no Keplerian elements (eccentricity, argument of perigee), no J2 perturbations, no real time scale. Acceleration is along-orbit angular only; it does not change the orbit radius (not physically realistic, but simple to reason about visually).
- Texture asset paths are absolute (`/textures/...`) — fine for root-served apps, breaks if hosted under a sub-path.
- 508 KB JS bundle is mostly three.js; fine for a prototype, can be code-split later.

## v3 — live satellite tracking (Celestrak + SGP4)
- [x] Add `satellite.js` (zero runtime deps, MIT) for SGP4 propagation
- [x] `src/liveSatellites.js`: Celestrak TLE fetch + 12 h localStorage cache, factory for dot+glow+orbit-trail Three.js group, `gmstRad(date)` helper
- [x] Panel "Live satellites" section: group selector, search box, available list (max 100 rows displayed), tracked list (cap 5), time multiplier input, sim-time UTC display
- [x] Earth rotation switches to GMST(simTime) while any live sat is tracked so satellites pass over the correct geography; manual rate disables in that mode
- [x] Live satellites share the existing view-cone visibility hit-test (cone+sat highlight on intersection)
- [x] Vite `base: './'` + `import.meta.env.BASE_URL` texture paths so the same build works on GitHub Pages
- [x] GitHub Actions workflow → Pages

## v4 — Moon page (spec: docs/superpowers/specs/2026-06-14-moon-page-design.md)
SRP refactor: extract body-agnostic concerns into shared modules used by both pages.
- [x] Download lunar albedo texture → `public/textures/moon.jpg` (Solar System Scope, CC BY 4.0)
- [x] `src/units.js` — `BODY_RADIUS = 1`
- [x] `src/uiHelpers.js` — `makeSwatch`, `makeRemoveButton`, `clamp`, `wrapLon`
- [x] `src/sceneSetup.js` — renderer/camera/controls/lights/stars/resize/loop
- [x] `src/groundPoints.js` — ground-point + cone collection + list + cone-states
- [x] `src/syntheticSats.js` — synthetic-sat collection + list + tick/reset + targets
- [x] `src/visibility.js` — generic cone hit-test (cone-states × targets)
- [x] Decouple `viewCone.js` / `satellite.js` from `earth.js` → import `BODY_RADIUS`
- [x] Refactor `src/main.js` onto shared modules; preserve live-sat logic verbatim
- [x] `src/moon.js` — lunar mesh (albedo map, no clouds/atmosphere)
- [x] `src/lunarPresets.js` — curated orbiters (LRO, Chandrayaan-2, Danuri, Lunar Prospector, Kaguya)
- [x] `src/moonMain.js` — thin composition root (no live sats; preset picker)
- [x] `moon.html` — mirror of `index.html`
- [x] Cross-link nav in both pages + `.page-nav` style
- [x] Multi-page Vite build (`rollupOptions.input`)
- [x] Verify: `npm run build` emits both pages; Earth (incl. live sats) + Moon render

### Review (2026-06-14)
- `npm run build` emits `dist/index.html` + `dist/moon.html`; `moon.html` bundle
  (3.6 kB) loads only shared modules + three.js, not the live-sat code.
- Headless browser: Moon renders (texture, starfield, 2 seeded cones + 2 seeded
  orbiters), all 5 presets list with working "Add", nav link + pause/reset work.
- Earth regression: 0 console errors, all 3 cones + 3 sats + 8 live groups
  present; tracking a live sat via the UI still creates a dot. Refactor is
  behavior-preserving.
- The Earth page now reuses the same shared modules — net dedup, not a parallel
  copy. Live-satellite *algorithm* (SGP4/GMST/trails) untouched.

## v5 — liquid-glass dock UI (spec: docs/superpowers/specs/2026-06-14-dock-ui-design.md)
Replaced the right-side panel on both pages with a macOS-style bottom-center dock.
- [x] `src/dock.js` — declarative dock: tiles from `[data-dock-panel]`, open/swap/close, Esc, click-outside
- [x] `src/pageChrome.js` — mounts dock + help popover (shared by both entries)
- [x] index.html + moon.html restructured: full-screen canvas, dock, slide-up glass sheet, floating nav pill, "?" help FAB. All form IDs preserved → main.js/moonMain.js logic untouched
- [x] Glass styling in style.css (dock, sheet, nav pill, help)
- [x] Fixed pre-existing bug: inclination `step="1"` vs default `51.6` → stepMismatch blocked Add; now `step="any"`
- [x] Fixed pre-existing bug: `<sub>` in altitude label became its own flex item (3-line wrap); wrapped label text in `<span>`
- [x] Verified headless: tiles, open/swap/close, add/remove, live groups, moon presets, 0 console errors

## v6 — two-body orbital engine + richer add modes (spec: docs/superpowers/specs/2026-06-14-orbital-engine-design.md)
Phase 1: replaced the circular deg/s model with real Keplerian physics; 3 input modes.
- [x] `src/orbit.js` — two-body math (Kepler solver w/ bisection fallback, rv2coe, coe2rv, ellipse). Pure, no THREE.
- [x] `src/orbit.test.js` — Vitest: M→E→M & coe2rv∘rv2coe round-trips, known periods/apogee, edge cases (15 tests)
- [x] `src/bodies.js` — EARTH/MOON {muKm3s2, radiusKm}
- [x] `satellite.js` renders an orbit (ellipse + dot), tick(simSec); ECI→scene swap, ÷radiusKm
- [x] `syntheticSats.js` manages orbit-based sats (body-aware), tick/reset(simSec)
- [x] `satelliteForm.js` — shared Circular/Keplerian/State-vector mode selector + validation (bound orbit, perigee≥surface)
- [x] `lunarPresets.js` → real km circular orbits
- [x] Unified sim clock + Time× in Simulation panel (both pages); old ω/α retired
- [x] Numerical safeguards: km-space math, clamped acos, wrapped mean anomaly, NaN guards
- [x] Verified: 15/15 tests; build; both pages add via all 3 modes; real periods (ISS 93 min, LRO 113 min); eccentric ellipse renders; invalid/below-surface rejected; cones still work
- Phase 2 (next): performance for many satellites (instancing, pooled vectors, throttled visibility)

## v7 — performance: many satellites (spec: docs/superpowers/specs/2026-06-15-perf-many-satellites-design.md)
Phase 2: instanced rendering + allocation-free hot path.
- [x] `src/satelliteField.js` — instanced dots+glows (one draw call each) + merged orbit LineSegments (rebuilt on change), slot/free-list, grow ×2, positions Float32Array, tick/reset
- [x] `visibility.js` — multi-group API (synthetic + live without per-frame merge); `pointInsideCone` moved in; `satellite.js` removed
- [x] `groundPoints.js` — cone-states cached + updated in place (no per-frame alloc)
- [x] `syntheticSats.js` — rides satelliteField; cached targets array; `addMany`; list capped at 100 rows
- [x] `main.js`/`moonMain.js` — cached live targets (rebuilt on track/untrack), stable visibility groups; `__app.addRandomSats(n)` bench hook
- [x] Verified: 15/15 tests; build; **draw calls flat 22→22 for 3→503 sats**; **0.048 ms/tick @ 503 sats**; form/live/presets/cones intact, both pages, 0 console errors

## Next iteration ideas
- Click-to-place ground points directly on the globe (raycaster).
- Show ground tracks of satellites as fading polylines on the Earth surface.
- Per-cone visibility log ("ISS entered Tokyo cone at t=12.3s").
- Pass predictions: list of next 5 cone entries/exits per ground station.
- Day/night terminator from a real sun direction; night-side city lights texture.
- Replace synthetic-orbit ω/α controls with a unified time-multiplier slider once we trust the live mode.
