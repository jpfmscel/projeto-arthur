# Orbital Engine & Richer Satellite Input — Design (Phase 1)

**Branch:** `feature/orbital-engine`
**Date:** 2026-06-14

## Goal

Replace the current circular "arbitrary deg/s" satellite model with a real
**two-body Keplerian engine**, and let the user add a satellite three ways:
**Circular**, **Classical Keplerian elements**, and **Position + velocity state
vectors**. Works on both the Earth and Moon pages with the correct gravitational
parameter per body. Orbits propagate on a shared sim clock and render as
ellipses with the body at a focus.

## Decisions (locked in via brainstorming)

| Q | Choice |
|---|---|
| Units | **Real: km & km/s**, angles in degrees; scaled to scene units internally |
| Model | **Unify on real two-body physics**; the old ω/α model is retired |
| Scope | **Both Earth & Moon** (μ + radius per body) |
| Optimizing | Richer add-modes + accuracy + UX now; **performance is Phase 2** |

## Phasing

- **Phase 1 (this spec):** orbit engine, three input modes, sim-clock
  unification, elliptical rendering, form UX, unit tests.
- **Phase 2 (next):** performance for many satellites — instanced dots/lines,
  pooled vectors, throttled/broad-phase visibility. (Rendering can't be
  optimized before the orbit model exists.) Phase 1 still avoids per-frame
  allocations in the hot path.

## Architecture (SRP)

| Module | Responsibility |
|---|---|
| `src/orbit.js` (new) | Pure two-body math. No THREE dependency. Builders + propagation + ellipse sampling. Unit-tested. |
| `src/bodies.js` (new) | `EARTH` / `MOON` = `{ muKm3s2, radiusKm }`. Centralizes the constant `liveSatellites.js` hardcodes. |
| `src/satellite.js` (refactor) | Turn an `orbit` + color + `radiusKm` into THREE meshes (ellipse ring + dot/glow); `tick(simTime)` propagates. |
| `src/syntheticSats.js` (refactor) | Manage orbits built from specs; list view; `tick(simTime)`; reset (epoch); visibility targets. Takes the page's `body`. |
| `src/satelliteForm.js` (new) | Shared mode-aware add form (Circular/Keplerian/State-vector): render fields, validate, emit an `orbit`. Both pages mount it. |
| `main.js` / `moonMain.js` | Compose: pass `body`, advance `simTime`, drive `tick`. |

### `src/orbit.js` API (no THREE)

```
makeOrbit({ a, e, i, raan, argp, nu, mu, epochSec })   // a km, angles rad
fromKeplerian({ aKm, e, incDeg, raanDeg, argpDeg, nuDeg }, mu, epochSec)
fromStateVector({ rKm:[x,y,z], vKmS:[vx,vy,vz] }, mu, epochSec)   // rv2coe
fromCircular({ altitudeKm, incDeg, raanDeg }, mu, radiusKm, epochSec) // e=0

orbit.positionEciKm(tSec) -> [x,y,z]      // propagate to absolute sim seconds
orbit.ellipseEciKm(samples=192) -> [[x,y,z], ...]   // one period
orbit.elements -> { aKm, e, incDeg, raanDeg, argpDeg, nuDeg, periodSec }
orbit.valid   -> boolean   // false for a<=0 or e>=1
```

Frame: standard ECI, **Z = polar axis** (math convention). The renderer applies
the same ECI→scene axis swap the live satellites use (`sx=x, sy=z, sz=-y`) and
divides by `radiusKm`, so all satellites share one inertial frame and the
existing view-cone hit-test is unaffected.

## Numerical robustness

The risk is algorithmic, not the language (JS numbers are IEEE-754 doubles).
Safeguards baked into `orbit.js`:

- **Compute in km/(km·s)**; convert to scene units only at the final step.
- **Kepler's equation** `M = E − e·sin E`: normalize `M` to `[−π, π]` and wrap
  mean anomaly each propagation step (bounded error over long runs). Newton–
  Raphson with seed `E0 = M + e·sin M` (or `E0 = π` for `e > 0.8`),
  `tol = 1e-12`, ≤ 60 iters, **bisection fallback** if Newton steps diverge
  (high `e`).
- **Clamp** arguments of `acos`/`asin` to `[−1, 1]` before the call (FP
  overshoot → no `NaN`).
- **`rv2coe` special cases** with thresholds: near-circular (`e < 1e-8` →
  `argp = 0`, use true longitude / argument of latitude), near-equatorial
  (`i < 1e-8` → `raan = 0`); `atan2` everywhere for correct quadrants;
  vis-viva `a = 1 / (2/r − v²/μ)` and the eccentricity vector arranged to limit
  cancellation.
- **Reject non-elliptical**: `a ≤ 0` or `e ≥ 1 − 1e-9` ⇒ `orbit.valid = false`;
  the form surfaces a clear error instead of drawing `NaN` geometry.
- **Guard** `NaN`/`Infinity`/zero-vector inputs up front.

## Testing (Vitest)

Add `vitest` (dev dep) + `npm test`. `src/orbit.test.js` covers:

- **Round-trip** `coe2rv ∘ rv2coe` for random bound orbits (`a`, `e∈[0,0.95]`,
  random angles) — elements recovered within `1e-6` (relative) / `1e-9` (rad).
- **Kepler** `M → E → M` across `e ∈ {0, 0.1, 0.5, 0.9, 0.95}` to `1e-10`.
- **Known orbits**: circular period `T = 2π√(a³/μ)`; `e=0` position magnitude
  ≈ `a` for all `t`; perigee/apogee radii `a(1∓e)` reached.
- **Edge cases**: equatorial circular, high-`e` (0.9), and that `e ≥ 1` /
  `a ≤ 0` report `valid = false`.

## Form UX (`satelliteForm.js`)

A segmented **mode selector** in the Satellites sheet; only the active mode's
fields show. Shared by both pages (mounted into a container so markup isn't
duplicated).

- **Circular**: Name, Altitude (km), Inclination (deg), RAAN (deg).
- **Keplerian**: Name, Semi-major axis (km), Eccentricity, Inclination, RAAN,
  Argument of pericenter (deg), True anomaly (deg).
- **State vector**: Name, X/Y/Z (km), Vx/Vy/Vz (km/s).

Validation: numbers finite; `a > radius` / `0 ≤ e < 1`; state vector must yield a
bound orbit (else inline error). Epoch = current `simTime` at creation, so the
satellite starts at its specified anomaly "now". Sensible defaults seed an
ISS-like orbit (Earth) / low polar orbit (Moon).

## Sim clock

Both pages advance `simTime` every frame by `dt × timeMultiplier` and propagate
all synthetic orbits to it (epoch-relative seconds). A **Time ×** control moves
into the Simulation panel on both pages (Earth already had one in the Live
panel; it becomes the single shared multiplier). Earth rotation stays manual by
default, GMST when live tracking is active. "Reset orbits" resets each orbit's
epoch to now (snaps back to its defining anomaly).

## Out of scope (Phase 1)

- Performance/instancing (Phase 2).
- J2 / perturbations, drag, maneuvers (future).
- Hyperbolic/parabolic trajectories (rejected for now).
- Changing the live-satellite (SGP4) path beyond sharing `bodies.js`.

## Verification

- `npm test` green (round-trips + known orbits + edge cases).
- `npm run build` emits both pages, no errors.
- Headless, both pages: add via each mode → ellipse + moving dot; a known
  circular orbit's period matches `2π√(a³/μ)` at a chosen multiplier; eccentric
  orbit visibly faster at perigee; cone highlight still works; invalid inputs
  show an error and add nothing.
