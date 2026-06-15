# Numerical Propagation: RK78 + Cowell (Central Field) — Design

**Branch:** `feature/rk78-cowell`
**Date:** 2026-06-15

## Goal

Add a numerical orbit propagator: **Runge–Kutta–Fehlberg 7(8)** integrating the
equations of motion via **Cowell's method**, with a **central-field** force model
(Option 1 — two-body only). A global toggle switches synthetic satellites
between the existing analytic Kepler propagation and the numerical one. Because
the central field has a known analytic solution, the integrator is validated
against `orbit.js` to high precision — and it's the foundation for later force
models (J2, drag, third-body = future Options) added as extra accelerations.

## Decisions (locked in via brainstorming)

| Q | Choice |
|---|---|
| Formulation | **Cowell** — Cartesian state `[r, v]`; integrate `r̈ = −μ r/|r|³`. Initial state from the orbit's Keplerian elements. |
| Output | **Propagation toggle** — Analytic Kepler ↔ Numerical RK78; satellites move by the selected engine. |
| Stepping | **Adaptive RKF7(8)** — embedded 7th/8th error estimate drives step size to a tolerance. |
| Scope | **Both Earth & Moon** (μ per body). |

## Architecture (SRP)

| Module | Responsibility |
|---|---|
| `src/rk78.js` (new) | Generic adaptive RKF7(8) integrator. Pure, no domain knowledge. Unit-tested. |
| `src/forceModel.js` (new) | `centralField(mu)` → `deriv(t, y)` for `y=[x,y,z,vx,vy,vz]` (km, km/s). Future perturbations extend here. |
| `src/satelliteField.js` (extend) | Per-set propagator mode. In numerical mode, each slot carries Cartesian state `[r,v]` (km) + its current time, advanced incrementally by RK78 each tick; analytic mode unchanged. |
| `src/syntheticSats.js` (extend) | `setPropagator(mode, simSec)` delegating to the field. |
| `main.js` / `moonMain.js` | A propagation `<select>` in the Simulation panel (Analytic / RK78 Cowell), passing the body's μ to the field. |

### `rk78.js` API

```
integrate(deriv, t0, y0, t1, opts?) -> { t, y, steps, rejects }
  deriv(t, y) -> dydt (array, same length as y)
  opts: { absTol=1e-9, relTol=1e-9, hInit?, hMin?, hMax?, maxSteps=10000 }
```

- 13-stage Fehlberg 7(8) tableau; advance with the 8th-order weights (local
  extrapolation); error estimate `(41/840)·(k0 + k10 − k11 − k12)·h`.
- Step control: scaled mixed abs/rel error norm; accept if ≤ 1, else reject and
  shrink; `h_new = h·clamp(safety·(1/err)^(1/8), 0.2, 5)`; last step trimmed to
  land exactly on `t1`.

### Numerical mode in the field

- On switch to RK78 (or `reset` while numerical), each active slot is **seeded**
  from the analytic state at the current time: `orbit.stateAt(elapsed)` → `[r,v]`
  (km), `tState = simSec`. Seamless handoff (identical for central field).
- `tick(simSec)` in numerical mode integrates each slot from `tState` to
  `simSec` with `integrate(centralFieldDeriv, …)`, stores the new `[r,v]` and
  `tState`, and writes the scene position (`÷ radiusKm`, same axis swap).
- Switching back to analytic resumes `orbit.positionEciKm(elapsed)` — the
  elements never changed, so it's exact for central field.

## Numerical robustness

- Physics in km/(km·s); scale to scene units only for display.
- Guard `|r| → 0` (no satellite reaches the origin, but clamp to avoid `Inf`).
- Adaptive controller floors `h` at `hMin` and caps `maxSteps` to avoid
  stalls; reject-and-shrink on `NaN`/over-tolerance.
- Incremental stepping carries small per-frame spans, so the integrator
  typically takes 1–2 steps per frame.

## Testing (Vitest)

`src/rk78.test.js`:
- **Analytic ODEs**: `y' = y` → `e^t`; harmonic oscillator `y'' = −y` →
  sin/cos, to `< 1e-8`.
- **Central-field vs `orbit.js`** (the key test): seed `[r,v]` from a Keplerian
  orbit, integrate over a full period (and a partial), compare position to
  `orbit.positionEciKm` — agree to `< 1e-4 km` (circular and eccentric, Earth
  and Moon μ).
- **Energy/SMA conservation**: specific energy stays constant over many orbits
  within tolerance.

Existing `orbit.test.js` stays green (untouched).

## UX

A `<select id="propMode">` in the Simulation panel on both pages:
*Analytic (Kepler)* / *Numerical (RK78 · Cowell)*. Default Analytic. Changing it
calls `syntheticSats.setPropagator(mode, simSec)`. For central field the motion
is visually identical — the agreement is the point (proven by the test).

## Out of scope

- Perturbations (J2, drag, SRP, third-body) — future Options, added in
  `forceModel.js`.
- Per-satellite propagator selection (global toggle for now).
- Encke / VOP formulations.

## Verification

- `npm test` green incl. the new RK78 suite (central field matches analytic).
- `npm run build`, both pages, no errors.
- Headless: toggle to RK78 on both pages; satellites keep moving on their
  orbits identically to analytic; no drift over a sustained run; cones still
  highlight; 0 console errors.
