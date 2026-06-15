# Perturbations: J2 & Third Body — Design (Options 2 & 3)

**Branch:** `feature/rk78-cowell` (continues the numerical-propagator work)
**Date:** 2026-06-15

## Goal

Extend the RK78 + Cowell propagator with two force-model options on top of the
central field (Option 1):

- **Opção 2 — J2**: add the oblateness (zonal `J2`) acceleration. The orbit then
  shows the real secular effects analytic Kepler can't: nodal regression and
  apsidal precession.
- **Opção 3 — J2 + Third body (Earth & Sun)**: add point-mass third-body
  perturbations. Central body is **the Moon** (per the user), so the third
  bodies are **Earth** and the **Sun**; the Earth page gets the natural analog
  (**Moon** + **Sun**).

## Decisions

| Q | Choice |
|---|---|
| Composition | One `makeDeriv({ mu, J2, Req, thirdBodies })` summing central + J2 + third-body accelerations; the UI picks which terms are on. |
| UI | A **dedicated "Propagation" dock tile** with its own panel (it can get complex): mode (Analytic ↔ Numerical RK78) + granular **perturbation toggles** (J2; each third body). Moving it out of the Simulation panel. The three named Options map to checkbox combinations (none / J2 / J2+both bodies). |
| Central body | Moon-focused; J2 on both pages, third bodies per page (Moon→Earth+Sun, Earth→Moon+Sun). |
| Ephemeris | **Simplified analytic** circular mean orbits for Sun/Moon/Earth (sandbox-grade); documented as not real-ephemeris-aligned. |

## Physics

All in the central-body inertial frame (Z = polar axis), km / km·s, before the
scene scaling — same frame the integrator already uses.

**J2 acceleration** (`r = |position|`, `z = position_z`, `Req` = equatorial radius):
```
k   = -1.5 · J2 · μ · Req² / r⁵
a_x = k · x · (1 − 5 z²/r²)
a_y = k · y · (1 − 5 z²/r²)
a_z = k · z · (3 − 5 z²/r²)
```

**Third-body acceleration** (body at `s` rel. central, `μ₃` its GM):
```
a = μ₃ · ( (s − r)/|s − r|³ − s/|s|³ )    // attraction − indirect term
```

**Constants** (added to `bodies.js`): `EARTH.j2 = 1.08263e-3`,
`MOON.j2 = 2.0330e-4`; `SUN = { muKm3s2: 1.32712440018e11 }`.

## Ephemeris (`src/ephemeris.js`, new)

Simplified, time-parameterized positions in a shared inertial plane (equatorial
XY of the central frame — ignores the ~5° lunar-orbit inclination and obliquities;
adequate to demonstrate the perturbation, **not** for real prediction):

```
sunRelEarth(t)  = AU      · [cos(ω_yr·t),  sin(ω_yr·t),  0]
moonRelEarth(t) = 384400  · [cos(ω_moon·t), sin(ω_moon·t), 0]
earthRelMoon(t) = −moonRelEarth(t)
sunRelMoon(t)   = sunRelEarth(t) − moonRelEarth(t)
```
`AU = 1.495978707e8 km`; `ω_yr = 2π/365.2564 d`, `ω_moon = 2π/27.3217 d`. `t` is
absolute sim-seconds (the integrator passes it to `deriv(t, y)`).

`thirdBodiesFor(centralName)` returns the right `[{ mu, positionAt }]`:
- Moon → `[{Earth μ, earthRelMoon}, {Sun μ, sunRelMoon}]`
- Earth → `[{Moon μ, moonRelEarth}, {Sun μ, sunRelEarth}]`

## Wiring

- `forceModel.js`: add `makeDeriv({mu, J2, Req, thirdBodies})`; keep
  `centralField(mu)`.
- `satelliteField.js`: `setPropagator(config, simSec)` where
  `config = { numerical, useJ2, thirdBodyNames }`; builds the matching deriv from
  the field's `j2` + `thirdBodies` config. Re-seeds on analytic→numerical.
- `syntheticSats.js`: pass `body.j2` + `thirdBodies` to the field; forward
  `setPropagator`.
- `propagationForm.js` (new): renders the dedicated Propagation panel UI (mode
  segmented control + perturbation checkboxes + active-model info) into a mount,
  and emits the config via `onChange`. Shared by both pages.
- `main.js` / `moonMain.js`: build `thirdBodies` via `ephemeris.thirdBodiesFor`,
  mount `propagationForm`, remove the old Simulation `<select>`.
- HTML: a `Propagation` `[data-dock-panel]` with `#prop-mount`; drop the
  `propMode` select from the Simulation panel.

## Testing (Vitest — `src/forceModel.test.js`, new)

- **Central field** still matches `orbit.js` via `makeDeriv({mu})` (sanity).
- **J2 nodal regression**: integrate a prograde orbit with J2 over several
  periods; recover Ω via `fromStateVector`; assert it **regresses** (ΔΩ < 0 for
  `i < 90°`) with magnitude within ~50% of the secular rate
  `Ω̇ = −1.5 n J2 (Req/p)² cos i`; and that `a`, `e` stay ~constant (no secular
  drift). Polar (`i = 90°`) ⇒ ~no nodal regression.
- **Third-body acceleration**: `makeDeriv` with one third body at a known `s`
  reproduces the hand-computed `a` formula.

`orbit.test.js` and `rk78.test.js` stay green.

## Verification

- `npm test` green incl. the new suite.
- `npm run build`, both pages, no errors.
- Headless: select **J2** → over a sustained run the orbit plane visibly
  precesses (node drifts) vs the frozen analytic ellipse; **J2 + 3rd body** runs
  stable (finite positions, no NaN). Cones still highlight; 0 console errors.

## Out of scope

- Real ephemeris (SPICE/VSOP), higher zonals/tesserals (J3, J22…), drag, SRP.
- Frame obliquity/lunar-orbit inclination (simplified planar ephemeris).
