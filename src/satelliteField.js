import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { integrate } from './rk78.js';
import { makeDeriv } from './forceModel.js';

// Instanced renderer + propagator for the whole synthetic-satellite set, so the
// scene stays at a handful of draw calls regardless of count:
//   - dots + glows  -> one InstancedMesh each (per-instance matrix + color)
//   - orbit lines   -> one merged LineSegments (per-vertex color), rebuilt only
//                      when the set changes (orbits are fixed in the inertial frame)
//
// Propagation is either analytic (Kepler, from orbit.js) or numerical (RK78 +
// Cowell central-field). In numerical mode each slot carries a Cartesian state
// [r,v] (km) advanced incrementally each tick.

const DOT_R = 0.018;
const GLOW_R = 0.045;
const ELLIPSE_SAMPLES = 128;
const INITIAL_CAP = 256;
const HOT = new THREE.Color(0xffffff);
const INT_OPTS = { absTol: 1e-6, relTol: 1e-9 };
const TRAIL_LEN = 1000;        // max points kept per satellite trail
const TRAIL_SAMPLE_SEC = 120;  // sim-seconds between trail samples (~1.4 days window)
const TRAIL_CAP = 50;         // skip trails above this many satellites (clutter/perf)

export function createSatelliteField({ parent, radiusKm, muKm3s2, j2 = 0, thirdBodies = [] }) {
  let deriv = makeDeriv({ mu: muKm3s2 }); // active numerical force model
  let mode = 'analytic'; // 'analytic' | 'rk78'

  let capacity = 0;
  let orbits = [];
  let epochs = new Float64Array(0);
  let colors = [];
  let positions = new Float32Array(0);
  let highlighted = new Uint8Array(0);
  let active = new Uint8Array(0);
  // numerical (RK78) per-slot Cartesian state in km / km·s and its sim time
  let rState = new Float64Array(0);
  let vState = new Float64Array(0);
  let tState = new Float64Array(0);
  // trail: per-slot list of recent scene-space positions, sampled by sim time
  let trails = [];
  let lastTrailSec = new Float64Array(0);
  let free = [];
  let liveCount = 0;

  const dotGeo = new THREE.SphereGeometry(DOT_R, 12, 8);
  const glowGeo = new THREE.SphereGeometry(GLOW_R, 12, 8);
  const dotMat = new THREE.MeshBasicMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false });
  let dotMesh = null;
  let glowMesh = null;

  const initW = typeof window !== 'undefined' ? window.innerWidth : 1;
  const initH = typeof window !== 'undefined' ? window.innerHeight : 1;

  // Fat lines (real pixel width; plain WebGL lines are always 1px).
  const lineGeo = new LineSegmentsGeometry();
  const lineMat = new LineMaterial({ vertexColors: true, transparent: true, opacity: 0.9, linewidth: 2.5, resolution: new THREE.Vector2(initW, initH) });
  const lineSeg = new LineSegments2(lineGeo, lineMat);
  lineSeg.frustumCulled = false;
  lineSeg.visible = false;
  parent.add(lineSeg);
  let linesDirty = false;
  let colorDirty = false;

  // Trails (one merged LineSegments, faded toward the tail). Shown only in
  // numerical mode, where they reveal perturbations: central field retraces the
  // ellipse, J2/third-body precesses and won't close.
  const trailGeo = new LineSegmentsGeometry();
  const trailMat = new LineMaterial({ vertexColors: true, transparent: true, opacity: 0.95, linewidth: 2.5, resolution: new THREE.Vector2(initW, initH) });
  const trailSeg = new LineSegments2(trailGeo, trailMat);
  trailSeg.frustumCulled = false;
  trailSeg.visible = false;
  parent.add(trailSeg);
  let trailDirty = false;

  const _m4 = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();

  // ECI km -> scene units (body radius = 1), matching the live satellites.
  const toScene = (e) => { _p.set(e[0] / radiusKm, e[2] / radiusKm, -e[1] / radiusKm); return _p; };
  const storePos = (i, s) => { positions[i * 3] = s.x; positions[i * 3 + 1] = s.y; positions[i * 3 + 2] = s.z; };

  function buildMeshes(cap) {
    const oldDot = dotMesh, oldGlow = glowMesh;
    dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, cap);
    glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, cap);
    dotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dotMesh.frustumCulled = false;
    glowMesh.frustumCulled = false;
    parent.add(dotMesh, glowMesh);
    if (oldDot) { parent.remove(oldDot); oldDot.dispose(); }
    if (oldGlow) { parent.remove(oldGlow); oldGlow.dispose(); }
    for (let i = 0; i < capacity; i++) { writeMatrix(i); writeColor(i); }
    dotMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    if (dotMesh.instanceColor) dotMesh.instanceColor.needsUpdate = true;
    if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
  }

  function grow(newCap) {
    const o2 = new Array(newCap).fill(null);
    const e2 = new Float64Array(newCap);
    const c2 = new Array(newCap).fill(null);
    const p2 = new Float32Array(newCap * 3);
    const h2 = new Uint8Array(newCap);
    const a2 = new Uint8Array(newCap);
    const r2 = new Float64Array(newCap * 3);
    const v2 = new Float64Array(newCap * 3);
    const t2 = new Float64Array(newCap);
    const tr2 = new Array(newCap);
    const lt2 = new Float64Array(newCap);
    for (let i = 0; i < capacity; i++) { o2[i] = orbits[i]; c2[i] = colors[i]; }
    for (let i = 0; i < newCap; i++) tr2[i] = i < capacity ? (trails[i] || []) : [];
    e2.set(epochs); p2.set(positions); h2.set(highlighted); a2.set(active);
    r2.set(rState); v2.set(vState); t2.set(tState); lt2.set(lastTrailSec);
    for (let i = newCap - 1; i >= capacity; i--) free.push(i);
    orbits = o2; epochs = e2; colors = c2; positions = p2; highlighted = h2; active = a2;
    rState = r2; vState = v2; tState = t2; trails = tr2; lastTrailSec = lt2;
    capacity = newCap;
    buildMeshes(capacity);
  }

  grow(INITIAL_CAP);

  function writeMatrix(i) {
    const sc = active[i] ? (highlighted[i] ? 1.6 : 1) : 0;
    _p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    _s.set(sc, sc, sc);
    _m4.compose(_p, _q, _s);
    dotMesh.setMatrixAt(i, _m4);
    glowMesh.setMatrixAt(i, _m4);
  }

  function writeColor(i) {
    const col = active[i] ? (highlighted[i] ? HOT : colors[i]) : (colors[i] || HOT);
    dotMesh.setColorAt(i, col);
    glowMesh.setColorAt(i, col);
  }

  // Seed slot i's numerical state from the analytic state at the given sim time
  // (so handing off analytic <-> numerical is seamless for the central field).
  function seedNumerical(i, simSec) {
    const { rKm, vKmS } = orbits[i].stateAt(simSec - epochs[i]);
    rState[i * 3] = rKm[0]; rState[i * 3 + 1] = rKm[1]; rState[i * 3 + 2] = rKm[2];
    vState[i * 3] = vKmS[0]; vState[i * 3 + 1] = vKmS[1]; vState[i * 3 + 2] = vKmS[2];
    tState[i] = simSec;
  }

  function add({ orbit, colorHex, epochSec }) {
    if (free.length === 0) grow(capacity * 2);
    const i = free.pop();
    orbits[i] = orbit;
    epochs[i] = epochSec;
    colors[i] = new THREE.Color(colorHex);
    highlighted[i] = 0;
    active[i] = 1;
    trails[i] = [];
    lastTrailSec[i] = -Infinity;
    liveCount++;
    storePos(i, toScene(orbit.positionEciKm(0)));
    if (mode === 'rk78') seedNumerical(i, epochSec);
    writeMatrix(i);
    writeColor(i);
    dotMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    colorDirty = true;
    linesDirty = true;
    return i;
  }

  function remove(i) {
    if (!active[i]) return;
    active[i] = 0;
    highlighted[i] = 0;
    orbits[i] = null;
    trails[i] = [];
    liveCount--;
    free.push(i);
    writeMatrix(i);
    dotMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    linesDirty = true;
    trailDirty = true;
  }

  function clearTrails() {
    for (let i = 0; i < capacity; i++) {
      if (trails[i]) trails[i].length = 0;
      lastTrailSec[i] = -Infinity;
    }
    trailDirty = true;
  }

  function setHighlighted(i, on) {
    const v = on ? 1 : 0;
    if (highlighted[i] === v) return;
    highlighted[i] = v;
    writeColor(i);
    colorDirty = true;
  }

  function getPosition(i, out) {
    return out.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }

  function reset(simSec) {
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      epochs[i] = simSec;
      if (mode === 'rk78') seedNumerical(i, simSec);
    }
    clearTrails();
  }

  // Configure propagation. `config = { numerical, useJ2, thirdBodyNames }`.
  // Re-seeds the numerical state from the current analytic state on the
  // analytic→numerical transition so motion continues without a jump; changing
  // the force terms while already numerical keeps the running state.
  function setPropagator(config, simSec) {
    const wasNumerical = mode === 'rk78';
    if (config.numerical) {
      const names = config.thirdBodyNames || [];
      deriv = makeDeriv({
        mu: muKm3s2,
        J2: config.useJ2 ? j2 : 0,
        Req: radiusKm,
        thirdBodies: thirdBodies.filter((tb) => names.includes(tb.name)),
      });
      mode = 'rk78';
      if (!wasNumerical) {
        for (let i = 0; i < capacity; i++) if (active[i]) seedNumerical(i, simSec);
      }
    } else {
      mode = 'analytic';
    }
    clearTrails(); // start the trail fresh for the newly selected model
  }

  function rebuildLines() {
    const segVerts = ELLIPSE_SAMPLES * 2;
    const pos = new Float32Array(liveCount * segVerts * 3);
    const col = new Float32Array(liveCount * segVerts * 3);
    let w = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      const pts = orbits[i].ellipseEciKm(ELLIPSE_SAMPLES).map((e) => {
        const s = toScene(e); return [s.x, s.y, s.z];
      });
      const c = colors[i];
      for (let kk = 0; kk < ELLIPSE_SAMPLES; kk++) {
        const a = pts[kk], b = pts[(kk + 1) % ELLIPSE_SAMPLES];
        pos[w] = a[0]; pos[w + 1] = a[1]; pos[w + 2] = a[2];
        col[w] = c.r; col[w + 1] = c.g; col[w + 2] = c.b; w += 3;
        pos[w] = b[0]; pos[w + 1] = b[1]; pos[w + 2] = b[2];
        col[w] = c.r; col[w + 1] = c.g; col[w + 2] = c.b; w += 3;
      }
    }
    if (w === 0) { lineSeg.visible = false; return; }
    lineGeo.setPositions(pos);
    lineGeo.setColors(col);
    lineSeg.visible = true;
  }

  function rebuildTrails() {
    let segs = 0;
    for (let i = 0; i < capacity; i++) if (active[i] && trails[i].length > 1) segs += trails[i].length - 1;
    const pos = new Float32Array(segs * 2 * 3);
    const col = new Float32Array(segs * 2 * 3);
    let w = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i] || trails[i].length < 2) continue;
      const t = trails[i];
      const c = colors[i];
      const n = t.length;
      for (let k = 0; k < n - 1; k++) {
        const a = t[k], b = t[k + 1];
        const fa = (k + 1) / n;       // older points fade toward black
        const fb = (k + 2) / n;
        pos[w] = a[0]; pos[w + 1] = a[1]; pos[w + 2] = a[2];
        col[w] = c.r * fa; col[w + 1] = c.g * fa; col[w + 2] = c.b * fa; w += 3;
        pos[w] = b[0]; pos[w + 1] = b[1]; pos[w + 2] = b[2];
        col[w] = c.r * fb; col[w + 1] = c.g * fb; col[w + 2] = c.b * fb; w += 3;
      }
    }
    if (segs === 0) { trailSeg.visible = false; return; }
    trailGeo.setPositions(pos);
    trailGeo.setColors(col);
    trailSeg.visible = mode === 'rk78';
  }

  function tick(simSec) {
    const trailing = mode === 'rk78' && liveCount <= TRAIL_CAP;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      if (mode === 'rk78') {
        const b = i * 3;
        const { y } = integrate(deriv, tState[i],
          [rState[b], rState[b + 1], rState[b + 2], vState[b], vState[b + 1], vState[b + 2]],
          simSec, INT_OPTS);
        rState[b] = y[0]; rState[b + 1] = y[1]; rState[b + 2] = y[2];
        vState[b] = y[3]; vState[b + 1] = y[4]; vState[b + 2] = y[5];
        tState[i] = simSec;
        storePos(i, toScene([y[0], y[1], y[2]]));
        if (trailing && simSec - lastTrailSec[i] >= TRAIL_SAMPLE_SEC) {
          const t = trails[i];
          t.push([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
          if (t.length > TRAIL_LEN) t.shift();
          lastTrailSec[i] = simSec;
          trailDirty = true;
        }
      } else {
        storePos(i, toScene(orbits[i].positionEciKm(simSec - epochs[i])));
      }
      writeMatrix(i);
    }
    dotMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    if (colorDirty) {
      if (dotMesh.instanceColor) dotMesh.instanceColor.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
      colorDirty = false;
    }
    if (linesDirty) { rebuildLines(); linesDirty = false; }
    if (trailDirty) { rebuildTrails(); trailDirty = false; }
    if (typeof window !== 'undefined') {
      lineMat.resolution.set(window.innerWidth, window.innerHeight);
      trailMat.resolution.set(window.innerWidth, window.innerHeight);
    }
  }

  return {
    add, remove, setHighlighted, getPosition, reset, tick, setPropagator,
    get count() { return liveCount; },
    get mode() { return mode; },
  };
}
