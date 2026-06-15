import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { predictPasses, makeRk78Sampler } from './passPrediction.js';
import { fromKeplerian } from './orbit.js';
import { makeDeriv } from './forceModel.js';
import { EARTH } from './bodies.js';

const TWO_PI = Math.PI * 2;
const noRot = () => 0;

// circular sat in the XZ plane, radius 2, period 100 s
const omega = TWO_PI / 100;
const orbitPos = (t, out) => out.set(2 * Math.cos(omega * t), 0, 2 * Math.sin(omega * t));

// dense reference: find pass intervals by a fine linear scan
function bruteForce(margin, t0, tEnd, dt) {
  const out = [];
  let pt = t0, pg = margin(t0);
  let enter = pg > 0 ? t0 : null;
  for (let t = t0 + dt; t <= tEnd; t += dt) {
    const g = margin(t);
    if (pg <= 0 && g > 0) enter = pt + dt * (-pg) / (g - pg);
    else if (pg > 0 && g <= 0 && enter != null) { out.push([enter, pt + dt * pg / (pg - g)]); enter = null; }
    pt = t; pg = g;
  }
  return out;
}

function marginFn(apexBody, axisBody, cosHA, posAt) {
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  return (t) => { posAt(t, p); d.subVectors(p, apexBody); const L = d.length(); return d.dot(axisBody) / L - cosHA; };
}

describe('predictPasses', () => {
  const apexBody = new THREE.Vector3(1, 0, 0);
  const axisOut = new THREE.Vector3(1, 0, 0);
  const cosHA = Math.cos(40 * Math.PI / 180);

  it('matches a dense brute-force scan', () => {
    const passes = predictPasses({
      positionSceneAt: orbitPos, apexBody, axisBody: axisOut, cosHalfAngle: cosHA,
      rotationAt: noRot, t0: 0, horizonSec: 250, stepSec: 2, maxPasses: 20,
    });
    const ref = bruteForce(marginFn(apexBody, axisOut, cosHA, orbitPos), 0, 250, 0.02);
    expect(passes.length).toBe(ref.length);
    for (let i = 0; i < ref.length; i++) {
      if (passes[i].exit == null) continue;
      expect(Math.abs(passes[i].enter - ref[i][0])).toBeLessThan(1);
      expect(Math.abs(passes[i].exit - ref[i][1])).toBeLessThan(1);
    }
  });

  it('reports a pass already in progress at t0', () => {
    // at t0 the sat is at (2,0,0): inside the +X cone
    const passes = predictPasses({
      positionSceneAt: orbitPos, apexBody, axisBody: axisOut, cosHalfAngle: cosHA,
      rotationAt: noRot, t0: 0, horizonSec: 250, stepSec: 2, maxPasses: 20,
    });
    expect(passes[0].enter).toBe(0);
  });

  it('finds no passes when the cone faces away from the orbit plane', () => {
    const axisUp = new THREE.Vector3(0, 1, 0); // orbit lies in y=0, so never inside
    const passes = predictPasses({
      positionSceneAt: orbitPos, apexBody, axisBody: axisUp, cosHalfAngle: cosHA,
      rotationAt: noRot, t0: 0, horizonSec: 250, stepSec: 2, maxPasses: 20,
    });
    expect(passes.length).toBe(0);
  });

  it('zero crossings have ~zero margin', () => {
    const passes = predictPasses({
      positionSceneAt: orbitPos, apexBody, axisBody: axisOut, cosHalfAngle: cosHA,
      rotationAt: noRot, t0: 0, horizonSec: 250, stepSec: 2, maxPasses: 20,
    });
    const m = marginFn(apexBody, axisOut, cosHA, orbitPos);
    // refine targets 0.5 s; on this fast 100 s-period orbit that is ~0.02 margin
    for (const p of passes) {
      if (p.enter > 0) expect(Math.abs(m(p.enter))).toBeLessThan(0.02);
      if (p.exit != null) expect(Math.abs(m(p.exit))).toBeLessThan(0.02);
    }
  });
});

describe('makeRk78Sampler + perturbed vs analytic', () => {
  const R = EARTH.radiusKm;
  const toScene = (p) => new THREE.Vector3(p[0] / R, p[2] / R, -p[1] / R);

  it('reproduces the analytic path under central field, diverges under J2', () => {
    const o = fromKeplerian({ aKm: 7000, e: 0, incDeg: 60, raanDeg: 0, argpDeg: 0, nuDeg: 0 }, EARTH.muKm3s2);
    const { rKm, vKmS } = o.stateAt(0);
    const out = new THREE.Vector3();

    const central = makeRk78Sampler({ deriv: makeDeriv({ mu: EARTH.muKm3s2 }), rKm, vKmS, t0: 0, radiusKm: R });
    const j2 = makeRk78Sampler({ deriv: makeDeriv({ mu: EARTH.muKm3s2, J2: EARTH.j2, Req: R }), rKm, vKmS, t0: 0, radiusKm: R });
    const T = o.elements.periodSec;

    // central numerical ≈ analytic
    central(5 * T, out);
    expect(out.distanceTo(toScene(o.positionEciKm(5 * T)))).toBeLessThan(0.01);

    // J2 path noticeably differs after many orbits
    const cen = new THREE.Vector3(); central(30 * T, cen);
    const per = new THREE.Vector3(); j2(30 * T, per);
    expect(per.distanceTo(cen)).toBeGreaterThan(0.02);
  });
});
