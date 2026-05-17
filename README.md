# Projeto Arthur

Interactive 3D Earth where you drop **ground stations** by latitude/longitude
and project a **view cone** (field-of-view half-angle) into space, then add
**satellites** with configurable orbit, velocity, and acceleration. Each
frame the app checks which satellites are inside which cones — satellites
and cones brighten while in contact.

## Stack

- [Vite](https://vitejs.dev/) for dev server + bundling
- [Three.js](https://threejs.org/) for the 3D scene
- Plain ES modules, no framework

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## How it works

- **Earth frame** — Earth body, cloud layer, and every ground station live in
  the same group, which rotates at the configurable "Earth rotation rate."
  Ground stations stay glued to their lat/lon.
- **Satellites** — live in the inertial world frame, so they appear to pass
  over the rotating ground stations. Each satellite orbits in a circular
  plane defined by:
  - `altitude` in Earth radii (R<sub>E</sub> = 1 unit)
  - `inclination` (deg) — orbital plane tilt from the equator (0° = equatorial, 90° = polar)
  - `RAAN` (deg) — longitude of the ascending node
- **Motion** — position along the orbit evolves as `θ(t) = θ₀ + ωt + ½αt²`,
  where `ω` is angular velocity (deg/sec) and `α` is angular acceleration
  (deg/sec², constant). The orbit radius is fixed, so `α` only changes the
  speed along the orbit, not the orbital altitude.
- **Visibility** — a satellite is "inside" a cone iff the vector from the
  cone's apex to the satellite makes an angle ≤ the cone's half-angle with
  the cone's axis (the local surface normal). When inside, the satellite
  brightens and grows, and the cone's opacity jumps.

## Project layout

```
index.html              Entry HTML + side panel UI
public/textures/        Earth surface, specular, normal, clouds textures
src/
  main.js               Scene setup, render loop, UI wiring, visibility check
  earth.js              Earth sphere (textured) + atmosphere shell
  viewCone.js           latLonToVec3 helper + cone factory
  satellite.js          Circular-orbit satellite + point-in-cone test
  stars.js              Background starfield
  style.css             Panel styling
```

## Coordinate convention

- Latitude 0 = equator, +Y = north pole.
- Longitude 0 lies on the +X axis. East longitude rotates toward -Z (so the
  mapping matches Three's default `SphereGeometry` UVs when an equirectangular
  Earth texture is applied).

## Textures

The four textures under `public/textures/` are from the
[three.js examples](https://github.com/mrdoob/three.js/tree/master/examples/textures/planets),
NASA-derived Blue Marble imagery, used under three.js's MIT license.

## Live satellite tracking

In addition to the synthetic-orbit playground, the right-hand panel has a
**Live satellites (Celestrak)** section that pulls real TLE data from
[celestrak.org](https://celestrak.org), propagates positions with
[satellite.js](https://github.com/shashwatak/satellite-js) (SGP4), and lets
you track up to **5 satellites** at once.

- Pick a group (Stations / GPS / Starlink / Weather …) and the available list
  populates. Free-text search filters within the group.
- Checking a satellite adds it to the inertial-frame scene with a dot, a glow
  halo, and a fading orbit trail.
- While **any** live satellite is being tracked, the Earth's rotation
  switches to **GMST-driven** so satellites pass over the correct geography.
  The manual "Earth rotation (deg/s)" input disables in this mode.
- The **Time ×** input under the live-satellites section sets how many sim
  seconds elapse per wall-clock second. Default is 60 (ISS does an orbit in
  ~90 wall-clock seconds at this rate).
- TLEs are cached in `localStorage` for 12 h to keep the UI snappy on reload.

## Roadmap

See [tasks/todo.md](tasks/todo.md) for the change log and next-iteration ideas
(ground-track polylines on the surface, pass-prediction overlays,
click-to-place stations, day/night terminator, etc.).
