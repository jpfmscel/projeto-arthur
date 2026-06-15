import * as THREE from 'three';

// Instanced renderer + propagator for the whole synthetic-satellite set, so the
// scene stays at a handful of draw calls regardless of count:
//   - dots + glows  -> one InstancedMesh each (per-instance matrix + color)
//   - orbit lines   -> one merged LineSegments (per-vertex color), rebuilt only
//                      when the set changes (orbits are fixed in the inertial frame)
//
// Each satellite keeps a stable slot index for its lifetime (free-list reuse,
// no reshuffling). Positions are written to a flat Float32Array each tick and
// read directly by the visibility test (the field's parent has no transform, so
// local == world).

const DOT_R = 0.018;
const GLOW_R = 0.045;
const ELLIPSE_SAMPLES = 128;
const INITIAL_CAP = 256;
const HOT = new THREE.Color(0xffffff);

export function createSatelliteField({ parent, radiusKm }) {
  let capacity = 0;
  let orbits = [];
  let epochs = new Float64Array(0);
  let colors = [];
  let positions = new Float32Array(0);
  let highlighted = new Uint8Array(0);
  let active = new Uint8Array(0);
  let free = [];
  let liveCount = 0;

  const dotGeo = new THREE.SphereGeometry(DOT_R, 12, 8);
  const glowGeo = new THREE.SphereGeometry(GLOW_R, 12, 8);
  const dotMat = new THREE.MeshBasicMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false });
  let dotMesh = null;
  let glowMesh = null;

  // merged orbit lines
  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35 });
  const lineSeg = new THREE.LineSegments(lineGeo, lineMat);
  lineSeg.frustumCulled = false;
  parent.add(lineSeg);
  let linesDirty = false;

  let colorDirty = false;
  const _m4 = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();

  const toScene = (e) => { _p.set(e[0] / radiusKm, e[2] / radiusKm, -e[1] / radiusKm); return _p; };

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
    // re-emit every existing instance into the fresh meshes
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
    for (let i = 0; i < capacity; i++) { o2[i] = orbits[i]; c2[i] = colors[i]; }
    e2.set(epochs); p2.set(positions); h2.set(highlighted); a2.set(active);
    for (let i = newCap - 1; i >= capacity; i--) free.push(i);
    orbits = o2; epochs = e2; colors = c2; positions = p2; highlighted = h2; active = a2;
    capacity = newCap;
    buildMeshes(capacity);
  }

  // Initial allocation.
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

  function add({ orbit, colorHex, epochSec }) {
    if (free.length === 0) grow(capacity * 2);
    const i = free.pop();
    orbits[i] = orbit;
    epochs[i] = epochSec;
    colors[i] = new THREE.Color(colorHex);
    highlighted[i] = 0;
    active[i] = 1;
    liveCount++;
    // initial position at epoch
    const s = toScene(orbit.positionEciKm(0));
    positions[i * 3] = s.x; positions[i * 3 + 1] = s.y; positions[i * 3 + 2] = s.z;
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
    liveCount--;
    free.push(i);
    writeMatrix(i); // zero-scale → hidden
    dotMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
    linesDirty = true;
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
    for (let i = 0; i < capacity; i++) if (active[i]) epochs[i] = simSec;
  }

  function rebuildLines() {
    const segVerts = ELLIPSE_SAMPLES * 2;            // closed loop → N segments
    const pos = new Float32Array(liveCount * segVerts * 3);
    const col = new Float32Array(liveCount * segVerts * 3);
    let w = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      const pts = orbits[i].ellipseEciKm(ELLIPSE_SAMPLES).map((e) => {
        const s = toScene(e); return [s.x, s.y, s.z];
      });
      const c = colors[i];
      for (let k = 0; k < ELLIPSE_SAMPLES; k++) {
        const a = pts[k], b = pts[(k + 1) % ELLIPSE_SAMPLES];
        pos[w] = a[0]; pos[w + 1] = a[1]; pos[w + 2] = a[2];
        col[w] = c.r; col[w + 1] = c.g; col[w + 2] = c.b; w += 3;
        pos[w] = b[0]; pos[w + 1] = b[1]; pos[w + 2] = b[2];
        col[w] = c.r; col[w + 1] = c.g; col[w + 2] = c.b; w += 3;
      }
    }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    lineGeo.setDrawRange(0, liveCount * segVerts);
  }

  // Call once per frame. Propagates active orbits and flushes dirty buffers.
  function tick(simSec) {
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      const s = toScene(orbits[i].positionEciKm(simSec - epochs[i]));
      positions[i * 3] = s.x; positions[i * 3 + 1] = s.y; positions[i * 3 + 2] = s.z;
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
  }

  return {
    add, remove, setHighlighted, getPosition, reset, tick,
    get count() { return liveCount; },
  };
}
