import { describe, it, expect } from 'vitest';
import { makeDeriv } from './forceModel.js';
import { integrate } from './rk78.js';
import { fromKeplerian, fromStateVector } from './orbit.js';
import { EARTH } from './bodies.js';

const MU = EARTH.muKm3s2;
const REQ = EARTH.radiusKm;
const J2 = EARTH.j2;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// signed smallest angle difference (deg)
function angDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

describe('makeDeriv — central field', () => {
  it('reproduces analytic Kepler with only the central term', () => {
    const o = fromKeplerian({ aKm: 8000, e: 0.1, incDeg: 30, raanDeg: 40, argpDeg: 10, nuDeg: 0 }, MU);
    const { rKm, vKmS } = o.stateAt(0);
    const { y } = integrate(makeDeriv({ mu: MU }), 0, [...rKm, ...vKmS], 0.5 * o.elements.periodSec, { absTol: 1e-10, relTol: 1e-10 });
    expect(dist([y[0], y[1], y[2]], o.positionEciKm(0.5 * o.elements.periodSec))).toBeLessThan(1e-3);
  });
});

describe('makeDeriv — J2 oblateness', () => {
  function nodeAfter(incDeg, nOrbits) {
    const o = fromKeplerian({ aKm: 7000, e: 0.01, incDeg, raanDeg: 50, argpDeg: 0, nuDeg: 0 }, MU);
    const { rKm, vKmS } = o.stateAt(0);
    const T = o.elements.periodSec;
    const { y } = integrate(makeDeriv({ mu: MU, J2, Req: REQ }), 0, [...rKm, ...vKmS], nOrbits * T, { absTol: 1e-9, relTol: 1e-9 });
    const end = fromStateVector({ rKm: [y[0], y[1], y[2]], vKmS: [y[3], y[4], y[5]] }, MU);
    return { o, end, dt: nOrbits * T };
  }

  it('makes a prograde orbit regress its node, near the secular rate', () => {
    const { o, end, dt } = nodeAfter(45, 10);
    const dOmega = angDiff(end.elements.raanDeg, o.elements.raanDeg); // degrees
    const n = 2 * Math.PI / o.elements.periodSec;
    const p = o.elements.aKm * (1 - o.elements.e ** 2);
    const rateDeg = -1.5 * n * J2 * (REQ / p) ** 2 * Math.cos(45 * Math.PI / 180) * (180 / Math.PI);
    const predicted = rateDeg * dt;
    expect(dOmega).toBeLessThan(0);                 // regresses
    expect(dOmega / predicted).toBeGreaterThan(0.5); // within ~50% of secular
    expect(dOmega / predicted).toBeLessThan(1.5);
  });

  it('leaves a and e secularly unchanged', () => {
    const { o, end } = nodeAfter(45, 10);
    expect(Math.abs(end.elements.aKm - o.elements.aKm) / o.elements.aKm).toBeLessThan(1e-3);
    expect(Math.abs(end.elements.e - o.elements.e)).toBeLessThan(1e-3);
  });

  it('barely regresses a polar orbit (cos i ≈ 0)', () => {
    const { o, end } = nodeAfter(90, 10);
    expect(Math.abs(angDiff(end.elements.raanDeg, o.elements.raanDeg))).toBeLessThan(0.5);
  });
});

describe('makeDeriv — third body', () => {
  it('adds the point-mass third-body acceleration', () => {
    const MU3 = 4902.8;
    const S = [0, 400000, 0];
    const r = [7000, 0, 0];
    const deriv = makeDeriv({ mu: MU, thirdBodies: [{ mu: MU3, positionAt: () => S }] });
    const out = deriv(0, [...r, 0, 0, 0]);

    // expected = central + third-body
    const rMag = Math.hypot(...r);
    const ac = [-MU * r[0] / rMag ** 3, -MU * r[1] / rMag ** 3, -MU * r[2] / rMag ** 3];
    const d = [S[0] - r[0], S[1] - r[1], S[2] - r[2]];
    const dMag = Math.hypot(...d);
    const sMag = Math.hypot(...S);
    const a3 = [
      MU3 * (d[0] / dMag ** 3 - S[0] / sMag ** 3),
      MU3 * (d[1] / dMag ** 3 - S[1] / sMag ** 3),
      MU3 * (d[2] / dMag ** 3 - S[2] / sMag ** 3),
    ];
    expect(Math.abs(out[3] - (ac[0] + a3[0]))).toBeLessThan(1e-15);
    expect(Math.abs(out[4] - (ac[1] + a3[1]))).toBeLessThan(1e-15);
    expect(Math.abs(out[5] - (ac[2] + a3[2]))).toBeLessThan(1e-15);
  });
});
