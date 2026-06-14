# Moon Page — Design

**Branch:** `feature/moon-page`
**Date:** 2026-06-14

## Goal

Add a second page, `moon.html`, that mirrors the existing Earth page but
visualizes the **Moon**: a textured lunar sphere with the same ground-point
view-cone and synthetic-orbit machinery. The Celestrak/SGP4 live-satellite
feature does not apply (Celestrak only publishes TLEs for Earth orbiters), so
that section is replaced by a curated list of real lunar orbiters offered as
one-click synthetic-orbit presets. The two pages cross-link.

## Decisions (locked in via brainstorming)

| Q | Choice |
|---|---|
| Live satellites | **Drop Celestrak/SGP4**; replace with curated lunar-orbiter presets that add synthetic orbits |
| Moon appearance | **Real NASA/USGS-derived albedo texture** (~2k JPG), no clouds, no atmosphere |
| Navigation | **Cross-link** in each page's panel header (Earth ⇄ Moon) |
| Process | Written spec (this doc) committed before implementation |

## Scope

In scope:
- `moon.html` mirroring `index.html`'s layout, plus the Moon-specific modules
  (`moon.js`, `lunarPresets.js`, `moonMain.js`) and `public/textures/moon.jpg`.
- SRP extraction of shared body-agnostic modules (`units`, `uiHelpers`,
  `sceneSetup`, `groundPoints`, `syntheticSats`, `visibility`) and refactor of
  the Earth page (`main.js`) onto them; decoupling `viewCone.js`/`satellite.js`
  from `earth.js`.
- Cross-link nav in both pages; multi-page Vite build config.

Out of scope:
- Any live/TLE data feed for lunar orbiters (no clean public source).
- Elliptical-orbit modelling (the synthetic model is circular; CAPSTONE's NRHO
  is intentionally excluded rather than misrepresented).
- Changing the live-satellite *algorithm* — its logic is preserved verbatim,
  only re-wired onto the shared collection/visibility helpers.

## Architecture

To honor the Single Responsibility Principle and avoid cloning `main.js` into a
second ~500-line god-file (≈200 duplicated lines), the body-agnostic concerns
are **extracted into focused shared modules consumed by both pages**. Each new
module has one reason to change. The Earth page is refactored onto the same
modules; the Earth-only live-satellite *logic* (SGP4 propagation, ECI→scene
axis swap, GMST coupling, trails) is preserved verbatim — only its wiring moves
to the shared collection/visibility helpers.

### Shared modules (new, body-agnostic)

| Module | Single responsibility |
|---|---|
| `src/units.js` | Defines `BODY_RADIUS = 1` (the rendered body's radius in scene units) |
| `src/uiHelpers.js` | Small DOM/math utilities: `makeSwatch`, `makeRemoveButton`, `clamp`, `wrapLon` |
| `src/sceneSetup.js` | Build & run the space scene: renderer, camera, controls, lights, starfield, resize, rAF loop (`start(onFrame)`) |
| `src/groundPoints.js` | Manage the ground-point + view-cone collection and its `<ul>`; expose per-frame cone world-states |
| `src/syntheticSats.js` | Manage the synthetic-satellite collection and its `<ul>`; `tick`, `reset`, expose hit-test targets |
| `src/visibility.js` | The cone hit-test: toggle cone/target highlights given cone-states + targets (generic over target type) |

### Existing modules

| Module | Change |
|---|---|
| `src/stars.js` | Unchanged (now invoked via `sceneSetup`) |
| `src/viewCone.js` | **Decoupled from `earth.js`** — imports `BODY_RADIUS` from `units.js` instead of `EARTH_RADIUS` (removes an Earth dependency from a body-agnostic module) |
| `src/satellite.js` | **Decoupled from `earth.js`** — same change |
| `src/earth.js` | Sources its radius from `units.js` (`EARTH_RADIUS = BODY_RADIUS`); otherwise unchanged |
| `src/main.js` | **Refactored** onto the shared modules; live-sat logic preserved |
| `src/liveSatellites.js` | Unchanged; imported by Earth page only |
| `src/style.css` | Shared; gains `.page-nav` (+ reuses existing list styles for presets) |

### New (Moon-specific)

| Module | Single responsibility |
|---|---|
| `src/moon.js` | Build the lunar mesh (albedo map, no clouds/atmosphere); `MOON_RADIUS = BODY_RADIUS` |
| `src/lunarPresets.js` | Curated lunar-orbiter preset data + render its pick-list |
| `src/moonMain.js` | Composition root for the Moon page (thin: wire modules + forms + sim controls + seed) |
| `moon.html` | The page markup (mirrors `index.html`) |

**Body-radius note:** the scene normalizes the rendered body to radius `1`.
`viewCone.js`/`satellite.js` use `BODY_RADIUS` for this; altitudes read as
"× R_Moon" (R_Moon ≈ 1737 km) on the Moon page and "× R_E" on Earth.

### Per-frame ownership

`sceneSetup` owns the rAF loop, `clock`, `controls.update()`, and
`renderer.render()`. It always renders (so the camera stays interactive even
when paused) and calls a page-supplied `onFrame(dt)` for sim updates. Each
page's `onFrame` decides what to advance:
- **Earth:** advance `simTime`, GMST-rotate `earthFrame` when live tracking is
  active (else manual rate), tick synthetic + live sats, run visibility over
  both target sets.
- **Moon:** manual-rate rotation, tick synthetic sats, run visibility over the
  synthetic targets only.

## `src/moon.js`

Mirror of `createEarth()` with these differences:
- **No clouds layer, no atmosphere shell** — the Moon has neither.
- Single sphere, `MeshPhongMaterial` with the albedo `map` (sRGB color space),
  low `shininess` (~5) and a dim/neutral `specular` (the Moon is matte; no
  ocean-style specular map).
- Subtle relief: reuse the albedo as a light `bumpMap` (small `bumpScale`) for
  crater shading — cheap, no extra asset, kept subtle to avoid a noisy look.
- Exports `MOON_RADIUS = 1` for symmetry with `EARTH_RADIUS`.

Texture path follows the existing `import.meta.env.BASE_URL + 'textures/...'`
convention so it works locally and under a GitHub Pages sub-path.

## `src/lunarPresets.js`

Exports an array of curated near-circular lunar orbiters. Altitudes are in
Moon-radii; `omega` is an arbitrary sim-time deg/s chosen for visible motion
(same convention as the Earth page's synthetic defaults — not a real mean
motion). Each preset maps directly onto `addSatellite()` args.

| Name | Real orbit | altitude (×R_Moon) | inclination | raan |
|---|---|---|---|---|
| LRO | ~50 km polar | 0.029 | 90° | 0° |
| Chandrayaan-2 Orbiter | ~100 km polar | 0.058 | 90° | 30° |
| Danuri (KPLO) | ~100 km polar | 0.058 | 90° | 60° |
| Lunar Prospector | ~100 km polar | 0.058 | 90° | 90° |
| Kaguya (SELENE) | ~100 km polar | 0.058 | 90° | 120° |

(Distinct RAAN values are assigned so the preset orbits are visually separated
even though several share the same altitude/inclination.)

## `src/moonMain.js`

Mirror of `main.js` with the live-satellite subsystem removed:

- Imports `createMoon` instead of `createEarth`; no `liveSatellites` import.
- **Removed:** `MAX_LIVE`, `liveTracking`, `loadLiveGroup`, `trackLive`,
  `untrackLive`, all `renderAvailable`/`renderTracking` live wiring, the
  `simTime`/`timeMultiplier`/GMST machinery, and the live branch of
  `updateVisibility()`.
- **Earth-frame rotation** becomes unconditional manual rate (no GMST coupling,
  since there are no live sats). The "rotation deg/s" input is always enabled.
- **Added:** wiring for the lunar-preset list — render each preset as a row
  with an "Add" button that calls the existing `addSatellite()` with the
  preset's params.
- Ground points and synthetic orbits behave exactly as on the Earth page;
  `updateVisibility()` keeps only the synthetic-satellite loop.
- Seed examples: a couple of lunar surface points (e.g. Apollo 11 site at
  0.67°N 23.47°E; a south-pole-ish station) and one or two preset orbiters.

## `moon.html`

Mirror of `index.html`:
- `<title>` "Projeto Arthur — Moon".
- Same `#app` / `#scene` / `#panel` skeleton, shared `/src/style.css`.
- Panel sections in order: **Add ground point** → **Synthetic orbits** →
  **Lunar orbiters** (preset list, replacing the live section) → **Simulation**
  (rotation deg/s, Pause, Reset orbits) → Controls/conventions `<details>`.
- `<script type="module" src="/src/moonMain.js">`.
- Nav link (see below).

## Navigation

A small link group added to both panel headers (next to the `<h1>`):

```
🌍 Earth ⇄ 🌙 Moon
```

On `index.html` the "Moon" target points to `./moon.html`; on `moon.html` the
"Earth" target points to `./index.html`. Relative hrefs keep it working under a
Pages sub-path. Styled minimally via a new `.page-nav` rule in `style.css`.

## Build

`vite.config.js` gains a multi-page input so the production build emits both
pages:

```js
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      moon: resolve(__dirname, 'moon.html'),
    },
  },
},
```

The dev server already serves any `.html` by path, so `npm run dev` needs no
change. `base: './'` is retained.

## Texture sourcing

Download a NASA/USGS-derived public lunar albedo JPG (~2k) into
`public/textures/moon.jpg` and credit the source in a comment. The download
will be **verified** (file exists, non-trivial size, loads in the scene) rather
than assumed. If a reliable fetch fails, fall back to a procedural neutral-gray
`MeshPhongMaterial` (no external asset) and flag this to the user.

## Testing / verification

- `npm run dev` → open both `/` and `/moon.html`; confirm the Moon renders with
  its texture, no clouds/atmosphere, stars present.
- Add a ground point on the Moon page → cone appears and brightens when a
  synthetic satellite passes through it.
- Click a lunar preset → a synthetic orbit with the documented params is added.
- Pause/Reset/rotation controls behave.
- Cross-links navigate both directions.
- `npm run build` → `dist/` contains both `index.html` and `moon.html` with
  hashed assets; `npm run preview` serves both.
