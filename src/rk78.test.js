import { describe, it, expect } from 'vitest';
import { integrate } from './rk78.js';
import { centralField } from './forceModel.js';
import { fromKeplerian } from './orbit.js';

const MU_EARTH = 398600.4418;
const MU_MOON = 4902.800;

const mag = ([x, y, z]) => Math.hypot(x, y, z);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('rk78 integrator (analytic ODEs)', () => {
  it('integrates y′ = y to e^t', () => {
    const { y } = integrate((t, yv) => [yv[0]], 0, [1], 1, { absTol: 1e-12, relTol: 1e-12 });
    expect(Math.abs(y[0] - Math.E)).toBeLessThan(1e-8);
  });

  it('solves the harmonic oscillator y″ = −y', () => {
    const deriv = (t, [x, v]) => [v, -x];
    const { y } = integrate(deriv, 0, [0, 1], Math.PI / 2, { absTol: 1e-12, relTol: 1e-12 });
    expect(Math.abs(y[0] - 1)).toBeLessThan(1e-8); // sin(π/2)
    expect(Math.abs(y[1] - 0)).toBeLessThan(1e-8); // cos(π/2)
  });

  it('integrates backward in time', () => {
    const { y } = integrate((t, yv) => [yv[0]], 1, [Math.E], 0, { absTol: 1e-12, relTol: 1e-12 });
    expect(Math.abs(y[0] - 1)).toBeLessThan(1e-8);
  });
});

describe('central-field Cowell vs analytic Kepler', () => {
  it('matches a circular Earth orbit over a period', () => {
    const o = fromKeplerian({ aKm: 7000, e: 0, incDeg: 45, raanDeg: 20, argpDeg: 0, nuDeg: 0 }, MU_EARTH);
    const { rKm, vKmS } = o.stateAt(0);
    const y0 = [...rKm, ...vKmS];
    const deriv = centralField(MU_EARTH);
    const T = o.elements.periodSec;
    for (const f of [0.1, 0.37, 0.5, 0.83, 1.0]) {
      const { y } = integrate(deriv, 0, y0, f * T, { absTol: 1e-9, relTol: 1e-9 });
      expect(dist([y[0], y[1], y[2]], o.positionEciKm(f * T))).toBeLessThan(1e-4);
    }
  });

  it('matches an eccentric Earth orbit', () => {
    const o = fromKeplerian({ aKm: 12000, e: 0.3, incDeg: 63, raanDeg: 120, argpDeg: 45, nuDeg: 10 }, MU_EARTH);
    const { rKm, vKmS } = o.stateAt(0);
    const { y } = integrate(centralField(MU_EARTH), 0, [...rKm, ...vKmS], 0.75 * o.elements.periodSec, { absTol: 1e-10, relTol: 1e-10 });
    expect(dist([y[0], y[1], y[2]], o.positionEciKm(0.75 * o.elements.periodSec))).toBeLessThan(2e-3);
  });

  it('matches a lunar orbit (Moon μ)', () => {
    const o = fromKeplerian({ aKm: 1837, e: 0.05, incDeg: 90, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_MOON);
    const { rKm, vKmS } = o.stateAt(0);
    const T = o.elements.periodSec;
    const { y } = integrate(centralField(MU_MOON), 0, [...rKm, ...vKmS], 0.5 * T, { absTol: 1e-9, relTol: 1e-9 });
    expect(dist([y[0], y[1], y[2]], o.positionEciKm(0.5 * T))).toBeLessThan(1e-4);
  });
});

describe('conservation', () => {
  it('conserves specific orbital energy over 5 orbits', () => {
    const o = fromKeplerian({ aKm: 9000, e: 0.2, incDeg: 30, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, MU_EARTH);
    const { rKm, vKmS } = o.stateAt(0);
    const energy = (r, v) => 0.5 * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) - MU_EARTH / mag(r);
    const E0 = energy(rKm, vKmS);
    const { y } = integrate(centralField(MU_EARTH), 0, [...rKm, ...vKmS], 5 * o.elements.periodSec, { absTol: 1e-10, relTol: 1e-10 });
    const E1 = energy([y[0], y[1], y[2]], [y[3], y[4], y[5]]);
    expect(Math.abs((E1 - E0) / E0)).toBeLessThan(1e-6);
  });
});
