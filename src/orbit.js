// Two-body (Keplerian) orbital mechanics — pure math, no THREE dependency.
//
// All inputs/outputs are in km and km/s with the standard ECI convention
// (Z = polar axis). The renderer is responsible for scaling to scene units and
// any axis swap. Numerical care (see the design spec) lives here: physics is
// done in km, Kepler's equation is solved with a guarded Newton iteration plus
// a bisection fallback, acos/asin arguments are clamped, and degenerate /
// non-elliptical orbits report `valid = false` instead of emitting NaN geometry.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
const SMALL = 1e-8; // threshold for "circular" / "equatorial" degeneracies

const clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
const norm2pi = (x) => { x %= TWO_PI; return x < 0 ? x + TWO_PI : x; };
const wrapPi = (x) => { x = (x + Math.PI) % TWO_PI; if (x < 0) x += TWO_PI; return x - Math.PI; };
const allFinite = (...xs) => xs.every(Number.isFinite);

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly E.
 * Newton–Raphson with a good seed; bisection fallback for high e.
 */
export function solveKepler(M, e) {
  M = wrapPi(M);
  if (e < 1e-12) return M;

  let E = e < 0.8 ? M : Math.PI * (M >= 0 ? 1 : -1);
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-13) return E;
  }

  // Newton failed to converge — bisect over [M−1, M+1] (|E−M| ≤ e < 1).
  let lo = M - 1, hi = M + 1;
  const g = (x) => x - e * Math.sin(x) - M;
  let glo = g(lo);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const gm = g(mid);
    if (Math.abs(gm) < 1e-13 || hi - lo < 1e-14) return mid;
    if (Math.sign(gm) === Math.sign(glo)) { lo = mid; glo = gm; } else { hi = mid; }
  }
  return 0.5 * (lo + hi);
}

const INVALID = {
  valid: false,
  elements: { aKm: NaN, e: NaN, incDeg: NaN, raanDeg: NaN, argpDeg: NaN, nuDeg: NaN, periodSec: NaN },
  positionEciKm: () => [NaN, NaN, NaN],
  stateAt: () => ({ rKm: [NaN, NaN, NaN], vKmS: [NaN, NaN, NaN] }),
  ellipseEciKm: () => [],
};

/**
 * Build an orbit from classical elements (radians) + μ at an epoch.
 * Returns INVALID for non-finite inputs, a ≤ 0, e ∉ [0,1), or μ ≤ 0.
 */
export function makeOrbit({ aKm, e, incRad, raanRad, argpRad, nuRad, mu, epochSec = 0 }) {
  if (!allFinite(aKm, e, incRad, raanRad, argpRad, nuRad, mu, epochSec)) return INVALID;
  if (!(aKm > 0) || e < 0 || e >= 1 - 1e-9 || !(mu > 0)) return INVALID;

  const n = Math.sqrt(mu / (aKm * aKm * aKm)); // mean motion, rad/s
  const period = TWO_PI / n;
  const p = aKm * (1 - e * e);                 // semi-latus rectum
  const h = Math.sqrt(mu * p);                 // specific angular momentum

  // Perifocal (PQW) → ECI rotation: first two columns (z_pqw is always 0).
  const cO = Math.cos(raanRad), sO = Math.sin(raanRad);
  const ci = Math.cos(incRad), si = Math.sin(incRad);
  const cw = Math.cos(argpRad), sw = Math.sin(argpRad);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
  const Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];

  // Mean anomaly at epoch from the true anomaly.
  const E0 = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nuRad), e + Math.cos(nuRad));
  const M0 = E0 - e * Math.sin(E0);

  function rvAtNu(nu) {
    const r = p / (1 + e * Math.cos(nu));
    const xp = r * Math.cos(nu), yp = r * Math.sin(nu);
    const vx = -(mu / h) * Math.sin(nu);
    const vy = (mu / h) * (e + Math.cos(nu));
    return {
      rEci: [xp * P[0] + yp * Q[0], xp * P[1] + yp * Q[1], xp * P[2] + yp * Q[2]],
      vEci: [vx * P[0] + vy * Q[0], vx * P[1] + vy * Q[1], vx * P[2] + vy * Q[2]],
    };
  }

  function nuAt(tSec) {
    const M = M0 + n * (tSec - epochSec);
    const E = solveKepler(M, e);
    return Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  }

  return {
    valid: true,
    elements: {
      aKm, e,
      incDeg: incRad * DEG,
      raanDeg: norm2pi(raanRad) * DEG,
      argpDeg: norm2pi(argpRad) * DEG,
      nuDeg: norm2pi(nuRad) * DEG,
      periodSec: period,
    },
    positionEciKm(tSec) { return rvAtNu(nuAt(tSec)).rEci; },
    stateAt(tSec) { const { rEci, vEci } = rvAtNu(nuAt(tSec)); return { rKm: rEci, vKmS: vEci }; },
    ellipseEciKm(samples = 192) {
      const pts = [];
      for (let i = 0; i < samples; i++) pts.push(rvAtNu((i / samples) * TWO_PI).rEci);
      return pts;
    },
  };
}

/** Classical elements with angles in degrees, a in km. */
export function fromKeplerian({ aKm, e, incDeg, raanDeg, argpDeg, nuDeg }, mu, epochSec = 0) {
  return makeOrbit({
    aKm, e,
    incRad: incDeg * RAD,
    raanRad: raanDeg * RAD,
    argpRad: argpDeg * RAD,
    nuRad: nuDeg * RAD,
    mu, epochSec,
  });
}

/** Circular orbit at a given altitude above the surface (e = 0). */
export function fromCircular({ altitudeKm, incDeg, raanDeg }, mu, radiusKm, epochSec = 0) {
  return makeOrbit({
    aKm: radiusKm + altitudeKm,
    e: 0,
    incRad: incDeg * RAD,
    raanRad: raanDeg * RAD,
    argpRad: 0,
    nuRad: 0,
    mu, epochSec,
  });
}

/** Build an orbit from an ECI state vector (position km, velocity km/s). */
export function fromStateVector({ rKm, vKmS }, mu, epochSec = 0) {
  const r = rKm, v = vKmS;
  if (!allFinite(...r, ...v, mu)) return INVALID;
  const rmag = Math.hypot(...r);
  const vmag = Math.hypot(...v);
  if (!(rmag > 0) || !(mu > 0)) return INVALID;

  // h = r × v ; node = k × h = [−h_y, h_x, 0]
  const hVec = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const hmag = Math.hypot(...hVec);
  const node = [-hVec[1], hVec[0], 0];
  const nmag = Math.hypot(...node);
  const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2];

  // eccentricity vector e = ((v²−μ/r)·r − (r·v)·v) / μ
  const c = vmag * vmag - mu / rmag;
  const eVec = [(c * r[0] - rv * v[0]) / mu, (c * r[1] - rv * v[1]) / mu, (c * r[2] - rv * v[2]) / mu];
  const e = Math.hypot(...eVec);

  const energy = vmag * vmag / 2 - mu / rmag;
  if (!(energy < 0)) return INVALID;            // parabolic / hyperbolic
  if (e >= 1 - 1e-9) return INVALID;
  const aKm = -mu / (2 * energy);

  const incRad = Math.acos(clamp1(hVec[2] / hmag));
  const equatorial = nmag < SMALL;
  const circular = e < SMALL;

  let raanRad = 0, argpRad = 0, nuRad = 0;
  if (!equatorial) {
    raanRad = Math.acos(clamp1(node[0] / nmag));
    if (node[1] < 0) raanRad = TWO_PI - raanRad;
  }

  if (!circular && !equatorial) {
    argpRad = Math.acos(clamp1((node[0] * eVec[0] + node[1] * eVec[1] + node[2] * eVec[2]) / (nmag * e)));
    if (eVec[2] < 0) argpRad = TWO_PI - argpRad;
    nuRad = Math.acos(clamp1((eVec[0] * r[0] + eVec[1] * r[1] + eVec[2] * r[2]) / (e * rmag)));
    if (rv < 0) nuRad = TWO_PI - nuRad;
  } else if (!circular && equatorial) {
    // longitude of periapsis (RAAN folded to 0)
    argpRad = Math.acos(clamp1(eVec[0] / e));
    if (eVec[1] < 0) argpRad = TWO_PI - argpRad;
    nuRad = Math.acos(clamp1((eVec[0] * r[0] + eVec[1] * r[1] + eVec[2] * r[2]) / (e * rmag)));
    if (rv < 0) nuRad = TWO_PI - nuRad;
  } else if (circular && !equatorial) {
    // argument of latitude (argp folded to 0)
    nuRad = Math.acos(clamp1((node[0] * r[0] + node[1] * r[1] + node[2] * r[2]) / (nmag * rmag)));
    if (r[2] < 0) nuRad = TWO_PI - nuRad;
  } else {
    // circular equatorial: true longitude
    nuRad = Math.acos(clamp1(r[0] / rmag));
    if (r[1] < 0) nuRad = TWO_PI - nuRad;
  }

  return makeOrbit({ aKm, e, incRad, raanRad, argpRad, nuRad, mu, epochSec });
}
