import * as THREE from 'three';
import { integrate } from './rk78.js';

// Predict cone "passes" (visibility windows) by root-finding on the visibility
// margin g(t) = (sat−apex)·axis/|sat−apex| − cos(halfAngle). g>0 ⇔ inside the
// cone. A pass is an interval where g>0; enter/exit are zero crossings. All in
// scene coordinates (matching runtime visibility); the cone is body-fixed and
// rotated about Y by the body rotation θ(t).

const INT_OPTS = { absTol: 1e-6, relTol: 1e-9 };
const REFINE_TOL_SEC = 0.5;

// rotate v about the +Y axis by θ into out (THREE rotation.y convention)
function rotateY(v, theta, out) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return out.set(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/**
 * @param positionSceneAt (t, outVec3) -> Vec3  satellite position in scene units
 * @param apexBody, axisBody  body-fixed cone apex (on the unit surface) + axis
 * @param cosHalfAngle
 * @param rotationAt (t) -> radians  body rotation about Y at sim-time t
 * @param t0, horizonSec, stepSec, maxPasses
 * @returns Array<{ enter, exit, durationSec, ongoing? }>  (sim seconds)
 */
export function predictPasses({
  positionSceneAt, apexBody, axisBody, cosHalfAngle, rotationAt,
  t0, horizonSec, stepSec = 30, maxPasses = 8,
}) {
  const pos = new THREE.Vector3(), apex = new THREE.Vector3(), axis = new THREE.Vector3(), d = new THREE.Vector3();

  function margin(t) {
    positionSceneAt(t, pos);
    const th = rotationAt(t);
    rotateY(apexBody, th, apex);
    rotateY(axisBody, th, axis);
    d.subVectors(pos, apex);
    const L = d.length();
    if (L === 0) return -1;
    return d.dot(axis) / L - cosHalfAngle;
  }

  // bisect for the crossing in [ta, tb] where g changes sign (ga at ta)
  function refine(ta, tb, ga) {
    while (tb - ta > REFINE_TOL_SEC) {
      const tm = 0.5 * (ta + tb);
      const gm = margin(tm);
      if (Math.sign(gm) === Math.sign(ga)) { ta = tm; ga = gm; } else { tb = tm; }
    }
    return 0.5 * (ta + tb);
  }

  const passes = [];
  const tEnd = t0 + horizonSec;
  let pt = t0;
  let pg = margin(t0);
  let openEnter = pg > 0 ? t0 : null; // already inside at t0

  for (let t = t0 + stepSec; t <= tEnd + 1e-6 && passes.length < maxPasses; t += stepSec) {
    const g = margin(t);
    if (pg <= 0 && g > 0) {
      openEnter = refine(pt, t, pg);
    } else if (pg > 0 && g <= 0 && openEnter != null) {
      const exit = refine(pt, t, pg);
      passes.push({ enter: openEnter, exit, durationSec: exit - openEnter });
      openEnter = null;
    }
    pt = t; pg = g;
  }
  if (openEnter != null && passes.length < maxPasses) {
    passes.push({ enter: openEnter, exit: null, durationSec: null, ongoing: true });
  }
  return passes;
}

/**
 * A random-access scene-position function backed by RK78. It caches a state
 * checkpoint at each new (increasing) sample time and integrates from the
 * nearest preceding checkpoint, so the predictor's bisection back-steps stay
 * cheap. State is in km; output is scaled to scene units (÷ radiusKm, axis swap).
 */
export function makeRk78Sampler({ deriv, rKm, vKmS, t0, radiusKm }) {
  const ckpts = [{ t: t0, y: [rKm[0], rKm[1], rKm[2], vKmS[0], vKmS[1], vKmS[2]] }];

  return function positionSceneAt(t, out) {
    let k = ckpts.length - 1;
    while (k > 0 && ckpts[k].t > t) k--;
    let y = ckpts[k].y;
    if (t > ckpts[k].t) {
      const r = integrate(deriv, ckpts[k].t, y, t, INT_OPTS);
      y = r.y;
      if (t > ckpts[ckpts.length - 1].t) ckpts.push({ t, y });
    }
    return out.set(y[0] / radiusKm, y[2] / radiusKm, -y[1] / radiusKm);
  };
}
