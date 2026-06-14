import { describe, it, expect } from 'vitest';
import {
  makeOrbit,
  fromKeplerian,
  fromStateVector,
  fromCircular,
  solveKepler,
} from './orbit.js';

const MU_EARTH = 398600.4418; // km^3/s^2
const R_EARTH = 6378.137;     // km
const TWO_PI = Math.PI * 2;

const mag = ([x, y, z]) => Math.hypot(x, y, z);

function expectRel(actual, expected, rel = 1e-6, abs = 1e-7) {
  const ok = Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected));
  expect(ok, `expected ${actual} ≈ ${expected}`).toBe(true);
}

// Compare two angles in degrees, tolerant of 360° wrap.
function expectAngle(actualDeg, expectedDeg, absDeg = 1e-5) {
  let d = (actualDeg - expectedDeg) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  expect(Math.abs(d), `angle ${actualDeg}° ≈ ${expectedDeg}°`).toBeLessThan(absDeg);
}

describe('solveKepler', () => {
  it('returns M when e = 0 (E = M)', () => {
    for (const M of [0, 0.5, 1.0, 3.0, -2.0]) {
      const E = solveKepler(M, 0);
      // E should equal M modulo 2π
      const diff = Math.atan2(Math.sin(E - M), Math.cos(E - M));
      expect(Math.abs(diff)).toBeLessThan(1e-12);
    }
  });

  it('round-trips M -> E -> M across eccentricities', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.95]) {
      for (let k = 0; k < 12; k++) {
        const M = -Math.PI + (k / 11) * TWO_PI;
        const E = solveKepler(M, e);
        const Mback = E - e * Math.sin(E);
        // compare on the circle
        const diff = Math.atan2(Math.sin(M - Mback), Math.cos(M - Mback));
        expect(Math.abs(diff)).toBeLessThan(1e-10);
      }
    }
  });
});

describe('fromKeplerian', () => {
  it('circular equatorial orbit: |r| = a for all t, correct period', () => {
    const a = 7000;
    const o = fromKeplerian({ aKm: a, e: 0, incDeg: 0, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0);
    expect(o.valid).toBe(true);
    const T = TWO_PI * Math.sqrt(a ** 3 / MU_EARTH);
    expectRel(o.elements.periodSec, T, 1e-9);
    for (const f of [0, 0.1, 0.25, 0.5, 0.73, 1]) {
      expectRel(mag(o.positionEciKm(f * T)), a, 1e-9);
    }
  });

  it('starts at true anomaly 0 on the +X axis (equatorial, argp 0)', () => {
    const o = fromKeplerian({ aKm: 8000, e: 0.2, incDeg: 0, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0);
    const r0 = o.positionEciKm(0);
    expectRel(mag(r0), 8000 * (1 - 0.2), 1e-7); // perigee radius a(1-e)
    expectRel(r0[0], 8000 * (1 - 0.2), 1e-7);    // along +X
  });

  it('reaches apogee a(1+e) at half a period', () => {
    const a = 10000, e = 0.2;
    const o = fromKeplerian({ aKm: a, e, incDeg: 30, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0);
    const T = o.elements.periodSec;
    expectRel(mag(o.positionEciKm(T / 2)), a * (1 + e), 1e-6);
  });
});

describe('fromCircular', () => {
  it('builds a = radius + altitude with e = 0', () => {
    const o = fromCircular({ altitudeKm: 400, incDeg: 51.6, raanDeg: 0 }, MU_EARTH, R_EARTH, 0);
    expect(o.valid).toBe(true);
    expectRel(o.elements.aKm, R_EARTH + 400, 1e-9);
    expect(o.elements.e).toBeLessThan(1e-12);
    expectAngle(o.elements.incDeg, 51.6);
  });
});

describe('fromStateVector (rv2coe) round-trips with coe2rv', () => {
  const cases = [
    { aKm: 8000, e: 0.1, incDeg: 45, raanDeg: 30, argpDeg: 60, nuDeg: 120 },
    { aKm: 26600, e: 0.74, incDeg: 63.4, raanDeg: 200, argpDeg: 270, nuDeg: 10 },
    { aKm: 7000, e: 0.001, incDeg: 98, raanDeg: 120, argpDeg: 0, nuDeg: 200 },
  ];
  for (const c of cases) {
    it(`recovers elements for a=${c.aKm} e=${c.e} i=${c.incDeg}`, () => {
      const o = fromKeplerian(c, MU_EARTH, 0);
      const { rKm, vKmS } = o.stateAt(0);
      const back = fromStateVector({ rKm, vKmS }, MU_EARTH, 0);
      expect(back.valid).toBe(true);
      expectRel(back.elements.aKm, c.aKm, 1e-6);
      expectRel(back.elements.e, c.e, 1e-6, 1e-9);
      expectAngle(back.elements.incDeg, c.incDeg, 1e-4);
      expectAngle(back.elements.raanDeg, c.raanDeg, 1e-4);
      expectAngle(back.elements.argpDeg, c.argpDeg, 1e-4);
      expectAngle(back.elements.nuDeg, c.nuDeg, 1e-4);
    });
  }

  it('equatorial circular state vector recovers i≈0, e≈0', () => {
    const a = 7500;
    const vCirc = Math.sqrt(MU_EARTH / a);
    const back = fromStateVector({ rKm: [a, 0, 0], vKmS: [0, vCirc, 0] }, MU_EARTH, 0);
    expect(back.valid).toBe(true);
    expectRel(back.elements.aKm, a, 1e-6);
    expect(back.elements.e).toBeLessThan(1e-6);
    expect(Math.abs(back.elements.incDeg)).toBeLessThan(1e-4);
  });
});

describe('invalid / non-elliptical orbits', () => {
  it('rejects e >= 1', () => {
    expect(fromKeplerian({ aKm: 8000, e: 1.2, incDeg: 0, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0).valid).toBe(false);
  });
  it('rejects a <= 0', () => {
    expect(makeOrbit({ aKm: -5000, e: 0.1, incRad: 0, raanRad: 0, argpRad: 0, nuRad: 0, mu: MU_EARTH, epochSec: 0 }).valid).toBe(false);
  });
  it('flags a hyperbolic state vector as invalid', () => {
    const r = [7000, 0, 0];
    const vEsc = Math.sqrt(2 * MU_EARTH / 7000); // escape speed
    const back = fromStateVector({ rKm: r, vKmS: [0, vEsc * 1.2, 0] }, MU_EARTH, 0);
    expect(back.valid).toBe(false);
  });
  it('guards NaN inputs', () => {
    expect(fromKeplerian({ aKm: NaN, e: 0, incDeg: 0, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0).valid).toBe(false);
  });
});

describe('ellipseEciKm', () => {
  it('returns the requested sample count with radii within [a(1-e), a(1+e)]', () => {
    const a = 9000, e = 0.3;
    const o = fromKeplerian({ aKm: a, e, incDeg: 20, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH, 0);
    const pts = o.ellipseEciKm(64);
    expect(pts.length).toBe(64);
    for (const p of pts) {
      const r = mag(p);
      expect(r).toBeGreaterThanOrEqual(a * (1 - e) - 1e-6);
      expect(r).toBeLessThanOrEqual(a * (1 + e) + 1e-6);
    }
  });
});
