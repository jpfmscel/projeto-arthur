# Pass Prediction (cone access windows) — Design

**Branch:** `feature/pass-prediction`
**Date:** 2026-06-15

## Goal

Predict, for each ground station's view cone, the upcoming time windows when each
synthetic satellite is visible (enters/exits the cone) — computed both **without
perturbations** (analytic Kepler) and **with perturbations** (RK78 + J2 +
third body) so the difference is visible. On-demand (not per frame).

## Decisions (brainstorming)

| Q | Choice |
|---|---|
| Layout | A **Passes** dock tile, results **grouped by ground station** → per satellite → its passes. |
| Targets | **Synthetic satellites** only; each shown as **Kepler vs J2+third-body**. |
| Horizon | **24 h** sim-time default (configurable); refine crossings to ~0.5 s. |
| Seeding | Both predictions start from the satellite's **analytic state at "now"** (`orbit.stateAt`), so they agree at t₀ and diverge only by the perturbation. |

## Method

The visibility margin for a satellite vs a cone:
```
g(t) = (sat(t) − apex(t))·axis(t) / |sat(t) − apex(t)|  −  cos(halfAngle)
```
`g > 0` ⇔ inside. A pass is an interval where `g > 0`; enter/exit are zero
crossings. Everything is computed in **scene coordinates** (matching runtime
visibility exactly):

- **sat(t):** analytic → `orbit.positionEciKm(t−epoch)`; perturbed → RK78 from the
  seed state with `makeDeriv({mu, J2, Req, thirdBodies})`.
- **cone(t):** apex/axis are the body-fixed lat/lon vectors rotated about Y by the
  body's rotation `θ(t)` — the **same rotation model the sim uses** (manual rate,
  or GMST when live tracking is active).
- **Sweep:** sample `g` from t₀ to t₀+horizon at `stepSec` (≈30 s, < shortest
  pass), detect sign changes, **bisect** to ~0.5 s. Output `{enter, exit,
  durationSec}` (or `ongoing` if open at the horizon), capped at `maxPasses`.

## Architecture (SRP)

| Module | Responsibility |
|---|---|
| `src/passPrediction.js` (new, pure, tested) | `predictPasses({ positionSceneAt, apexBody, axisBody, cosHalfAngle, rotationAt, t0, horizonSec, stepSec, maxPasses })` → passes. Plus `makeRk78Sampler({ deriv, rKm, vKmS, t0, radiusKm })` → a random-access `positionSceneAt` (caches grid checkpoints, integrates from the nearest one — supports the bisection's small back-steps). |
| `src/passesPanel.js` (new) | Renders the Passes panel: horizon input + Compute button; on compute, builds analytic & perturbed position fns per sat, runs `predictPasses` per (station × sat), and renders grouped results (Kepler vs perturbed enter/duration + Δ). |
| `groundPoints.js` | `getConeDefs()` → `[{ name, apexBody, axisBody, cosHalfAngle }]` (body-fixed). |
| `syntheticSats.js` | store `epochSec` per entry; `getOrbitDefs()` → `[{ name, orbit, epochSec }]`. |
| `main.js` / `moonMain.js` | provide `rotationAt(simSec)` + the perturbed force model (body μ/J2/Req + thirdBodies); mount the panel in a new `Passes` dock tile. |

## UI

`Passes` dock tile (🔭). Panel: a horizon field (h, default 24) + **Compute
passes** button + a "computed at <sim-time>" note. Results grouped:
```
London
  ISS-ish
    Kepler     enter 12:34:56 UTC · 4.2 min
    +J2+3body  enter 12:35:08 UTC · 4.1 min   (Δ enter +12 s)
  Sun-sync …
```
Up to `maxPasses` per pair; "no passes in horizon" when empty. Perturbed column
uses the full model (J2 + all third bodies), independent of the live propagation
toggle, so "with perturbations" is always well-defined.

## Testing (Vitest — `src/passPrediction.test.js`)

- **Brute-force agreement**: for a circular orbit + a cone with a known rotation,
  `predictPasses` enter/exit times match a dense linear scan to < step.
- **Margin sanity**: at each predicted `enter`/`exit`, |g| ≈ 0; midpoint `g` > 0.
- **No-pass case**: a cone facing away yields zero passes.
- **Perturbed ≠ analytic**: with J2 on an inclined orbit over a long horizon, the
  perturbed pass times differ from analytic (non-zero Δ).

## Verification

- `npm test` green incl. the new suite; `npm run build` clean.
- Headless both pages: Compute lists passes grouped by station; perturbed vs
  Kepler differ for inclined orbits; times line up with the animation when run;
  0 console errors.

## Out of scope

- Max-elevation / azimuth per pass; live-satellite passes; exporting; auto-refresh
  as the sim runs (compute is on-demand).
