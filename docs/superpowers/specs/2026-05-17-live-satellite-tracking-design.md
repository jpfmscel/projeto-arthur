# Live Satellite Tracking — Design

**Branch:** `feature/live-satellite-tracking`
**Date:** 2026-05-17

## Goal

Let the user browse the Celestrak catalogue, search by name, and pick up to
**5 satellites** to track live in the existing 3D scene. Tracked satellites
appear as moving dots in the inertial frame, propagated with NORAD SGP4 from
real TLE data, and they participate in the existing view-cone visibility hit
test (highlight when inside any cone).

## Decisions (locked in via brainstorming)

| Q | Choice |
|---|---|
| Propagator | `satellite.js` (zero-dep NPM package, MIT) — only third-party lib added |
| Catalogue UX | Group dropdown + free-text search box; default to a small group (`stations`, ~15 sats) so first load is fast |
| Time scale | **Separate** sim clock for live mode — its own time-multiplier input. Existing synthetic-mode "Earth rotation deg/s" stays as-is |
| Coexistence | **Separate panel sections**: existing "Synthetic orbits" form stays; new "Live satellites" section below. Same visibility hit-test for both |

## Data source

Celestrak's `gp.php` endpoint, JSON format. No auth, CORS-enabled.

```
https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=json
```

Each record has `OBJECT_NAME`, `OBJECT_ID` (NORAD ID), plus the OMM mean-elements
needed to seed `satellite.js` via `twoline2satrec` (we convert OMM→TLE-style
strings, or use `satellite.js`'s `json2satrec` shim).

**Default group list** (8 entries — keep it minimal, user can extend later):

- `stations` — ISS, CSS, Tiangong, etc. (~15)
- `active` — all active satellites (~10k) — paginated/searchable
- `gps-ops` — GPS constellation (~30)
- `glo-ops` — GLONASS (~25)
- `galileo` — Galileo (~30)
- `weather` — NOAA, Meteosat, etc. (~50)
- `science` — Hubble, telescopes (~75)
- `starlink` — Starlink constellation (~6000)

**Caching:** keep the last fetched JSON for each group in `localStorage` with
a 12-hour TTL. Saves bandwidth and means the UI is usable offline once primed.

## Time / Earth-rotation interaction

The Earth's rotation must match GMST(simTime) for live satellites to appear
over the right geographic location. So:

- When **at least one live satellite is being tracked**, the existing manual
  "Earth rotation deg/s" input becomes disabled with a tooltip
  ("auto-driven by sidereal rotation while live tracking is active"), and
  `earthFrame.rotation.y = gstime(simTime)` each frame.
- When the tracked list is empty, the manual input is re-enabled.

`simTime` is a `Date` that advances each frame by `dt * multiplier`. Multiplier
default = 60 (one minute per real second; ISS does a full orbit in 90 sec
on-screen). Range 1–3600 via numeric input.

A small clock display shows the current sim time in UTC.

## Coordinate-frame conversion

`satellite.js` returns ECI position (km) at a given Date. Map to scene units
(Earth radius = 1) with this axis swap:

```
scene.x =  eci.x / R_EARTH_KM
scene.y =  eci.z / R_EARTH_KM     // ECI Z (north pole) → scene Y (up)
scene.z = -eci.y / R_EARTH_KM     // keeps the frame right-handed
```

Place tracked sats directly under `satellitesRoot` (the inertial-frame group),
NOT under `earthFrame`. They share the existing `visibility` hit-test because
the test reads cone world positions which already account for `earthFrame`'s
rotation.

## UI

New panel section between "Add satellite" and "Simulation":

```
Live satellites
├ Group: [stations ▼]   Search: [          ]
├ Available (loading… | error… | listed):
│   ☐ ISS (ZARYA)   25544
│   ☐ CSS (TIANHE)  48274
│   ...                                       (scrollable, ~200px max)
├ Tracking (3/5):
│   ● ISS  RM
│   ● CSS  RM
│   ...
└ Sim time multiplier: [60]×    UTC: 2026-05-17 14:23:17
```

- Checkbox toggles tracking. When 5 are tracked, remaining checkboxes are
  disabled with a hint.
- Each tracked satellite gets a color from the same palette as synthetic
  ones, a dot + faint trail (last 90 sim-seconds of positions, ~1 quarter
  orbit), and lights up white when inside any view cone.
- "RM" button removes from tracking (same affordance as synthetic list).

## File layout

```
src/
  liveSatellites.js   NEW: fetch + cache + satellite.js wrapper + per-sat factory
  main.js             UPDATED: wire UI, add per-frame live propagation,
                               gate earthFrame.rotation on live-active state
  ...
index.html            UPDATED: new panel section
src/style.css         UPDATED: small additions for the tracking list
package.json          UPDATED: + "satellite.js": "^5.0.0"
```

## Error handling

- Network failure on group fetch → show "Failed to load — Retry" inline; keep
  any previously-cached list usable.
- Malformed TLE / SGP4 propagation error → silently skip that satellite,
  log warning to console.
- CORS surprise (Celestrak does set headers, but just in case) → same retry UI;
  no fallback because we'd need a CORS proxy which is a separate decision.

## Out of scope (next iteration)

- Real-time pass predictions ("next ISS pass over London in 23 min")
- Ground-track polylines on the Earth surface
- TLE freshness indicator
- Per-satellite-orbit color customization
- Switching from Celestrak to Space-Track.org for authoritative TLEs

## Verification plan

- Build passes (`npm run build`).
- Manual smoke (described in commit message; user verifies on the published
  site since they're AFK):
  - Open dropdown → "stations" group lists ISS, CSS at least.
  - Pick ISS — dot appears in orbit, orbit trail visible.
  - Drop a London ground point with halfAngle ≈ 80° — ISS dot brightens when it
    crosses London's cone.
  - Bump time multiplier to 600 — ISS orbits in ~9 s on-screen.
