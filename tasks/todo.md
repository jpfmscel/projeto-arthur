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

## Next iteration ideas
- Click-to-place ground points directly on the globe (raycaster).
- Show ground tracks of satellites as fading polylines on the Earth surface.
- Per-cone visibility log ("ISS entered Tokyo cone at t=12.3s").
- Pass predictions: list of next 5 cone entries/exits per ground station.
- Day/night terminator from a real sun direction; night-side city lights texture.
- Replace synthetic-orbit ω/α controls with a unified time-multiplier slider once we trust the live mode.
