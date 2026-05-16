import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createEarth } from './earth.js';
import { createStarfield } from './stars.js';
import { createViewCone } from './viewCone.js';
import { createSatellite, pointInsideCone } from './satellite.js';

// ---------- scene setup ----------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x05070d, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(0, 1.2, 3.6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.4;
controls.maxDistance = 12;

// ---------- lights ----------

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(5, 3, 4);
scene.add(sun);

// ---------- world ----------

scene.add(createStarfield());

// The "earth frame" rotates with the planet. Its children — the Earth body,
// the cloud layer, and every ground-station point/cone — all move together
// at the Earth's rotation rate. Satellites stay in the world (inertial)
// frame so they appear to pass over rotating ground stations.
const earthFrame = new THREE.Group();
scene.add(earthFrame);

const earth = createEarth();
earthFrame.add(earth);

const pointsRoot = new THREE.Group();
earthFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group();
scene.add(satellitesRoot);

// ---------- ground points (view cones) ----------

const points = []; // { id, lat, lon, halfAngle, label, color, cone }

const palette = [
  0x6ec1ff, 0xffb86c, 0x9af07a, 0xff79c6,
  0xf1fa8c, 0xbd93f9, 0xff5555, 0x8be9fd,
];
let pointColorIdx = 0;
let nextPointId = 1;

function addPoint({ lat, lon, halfAngle, label }) {
  const color = palette[pointColorIdx++ % palette.length];
  const id = nextPointId++;
  const cone = createViewCone({ lat, lon, halfAngleDeg: halfAngle, color });
  pointsRoot.add(cone.group);
  const entry = { id, lat, lon, halfAngle, label, color, cone };
  points.push(entry);
  renderPointsList();
  return entry;
}

function removePoint(id) {
  const idx = points.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const [removed] = points.splice(idx, 1);
  pointsRoot.remove(removed.cone.group);
  removed.cone.dispose();
  renderPointsList();
}

// ---------- satellites ----------

const satellites = []; // { id, name, params, sat, color }

const satPalette = [
  0xffd166, 0x06d6a0, 0xef476f, 0x118ab2,
  0x8338ec, 0xfb5607, 0x80ed99, 0xff006e,
];
let satColorIdx = 0;
let nextSatId = 1;

function addSatellite({ name, altitude, inclination, raan, omega, alpha }) {
  const color = satPalette[satColorIdx++ % satPalette.length];
  const id = nextSatId++;
  const sat = createSatellite({
    altitude,
    inclinationDeg: inclination,
    raanDeg: raan,
    omegaDegPerSec: omega,
    alphaDegPerSec2: alpha,
    color,
  });
  satellitesRoot.add(sat.group);
  const entry = {
    id, color, sat,
    name: name || `Sat ${id}`,
    params: { altitude, inclination, raan, omega, alpha },
  };
  satellites.push(entry);
  renderSatellitesList();
  return entry;
}

function removeSatellite(id) {
  const idx = satellites.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const [removed] = satellites.splice(idx, 1);
  satellitesRoot.remove(removed.sat.group);
  removed.sat.dispose();
  renderSatellitesList();
}

function resetSatellites() {
  for (const s of satellites) s.sat.reset();
}

// ---------- per-frame hit test: which satellites are inside which cones ----------

const _apex = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function updateVisibility() {
  // First, gather each cone's current world apex + axis (they move as the
  // earth frame rotates) and reset their "active" state.
  const coneState = points.map((p) => {
    p.cone.cone.getWorldPosition(_apex);
    p.cone.cone.getWorldQuaternion(_quat);
    const axis = _up.clone().applyQuaternion(_quat).normalize();
    p.cone.setActive(false);
    return { apex: _apex.clone(), axis, cosHalfAngle: p.cone.cosHalfAngle, point: p };
  });

  for (const s of satellites) {
    const worldPos = s.sat.satMesh.getWorldPosition(new THREE.Vector3());
    let insideAny = false;
    for (const c of coneState) {
      if (pointInsideCone(worldPos, c.apex, c.axis, c.cosHalfAngle)) {
        c.point.cone.setActive(true);
        insideAny = true;
      }
    }
    s.sat.setHighlighted(insideAny);
  }
}

// ---------- UI wiring ----------

const pointForm = document.getElementById('add-point-form');
const ptLat = document.getElementById('lat');
const ptLon = document.getElementById('lon');
const ptHalfAngle = document.getElementById('halfAngle');
const ptLabel = document.getElementById('label');
const pointsList = document.getElementById('points');

pointForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const lat = clamp(parseFloat(ptLat.value), -90, 90);
  const lon = wrapLon(parseFloat(ptLon.value));
  const halfAngle = clamp(parseFloat(ptHalfAngle.value), 1, 89);
  const label = ptLabel.value.trim();
  if ([lat, lon, halfAngle].some(Number.isNaN)) return;
  addPoint({ lat, lon, halfAngle, label });
  ptLabel.value = '';
});

function renderPointsList() {
  pointsList.innerHTML = '';
  for (const p of points) {
    const li = document.createElement('li');
    li.appendChild(makeSwatch(p.color));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.label || `Point ${p.id}`;
    const coords = document.createElement('div');
    coords.className = 'coords';
    coords.textContent = `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}° · FOV ${p.halfAngle}°`;
    meta.appendChild(name); meta.appendChild(coords);
    li.appendChild(meta);
    li.appendChild(makeRemoveButton(() => removePoint(p.id)));
    pointsList.appendChild(li);
  }
}

const satForm = document.getElementById('add-sat-form');
const satName = document.getElementById('satName');
const satAlt = document.getElementById('satAlt');
const satInc = document.getElementById('satInc');
const satRaan = document.getElementById('satRaan');
const satOmega = document.getElementById('satOmega');
const satAlpha = document.getElementById('satAlpha');
const satsList = document.getElementById('satellites');

satForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const altitude = clamp(parseFloat(satAlt.value), 0.01, 20);
  const inclination = clamp(parseFloat(satInc.value), 0, 180);
  const raan = wrapLon(parseFloat(satRaan.value));
  const omega = parseFloat(satOmega.value);
  const alpha = parseFloat(satAlpha.value);
  if ([altitude, inclination, raan, omega, alpha].some(Number.isNaN)) return;
  addSatellite({ name: satName.value.trim(), altitude, inclination, raan, omega, alpha });
  satName.value = '';
});

function renderSatellitesList() {
  satsList.innerHTML = '';
  for (const s of satellites) {
    const li = document.createElement('li');
    li.appendChild(makeSwatch(s.color));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = s.name;
    const params = document.createElement('div');
    params.className = 'coords';
    const { altitude, inclination, raan, omega, alpha } = s.params;
    params.textContent =
      `alt ${altitude} · inc ${inclination}° · RAAN ${raan}° · ` +
      `ω ${omega}°/s${alpha ? ` · α ${alpha}°/s²` : ''}`;
    meta.appendChild(name); meta.appendChild(params);
    li.appendChild(meta);
    li.appendChild(makeRemoveButton(() => removeSatellite(s.id)));
    satsList.appendChild(li);
  }
}

document.getElementById('reset-orbits').addEventListener('click', resetSatellites);

const earthRateInput = document.getElementById('earthRate');
let earthRateDegPerSec = parseFloat(earthRateInput.value);
earthRateInput.addEventListener('change', () => {
  const v = parseFloat(earthRateInput.value);
  if (!Number.isNaN(v)) earthRateDegPerSec = v;
});

const pauseBtn = document.getElementById('pause');
let paused = false;
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
});

// ---------- helpers ----------

function makeSwatch(colorInt) {
  const span = document.createElement('span');
  span.className = 'swatch';
  span.style.background = `#${colorInt.toString(16).padStart(6, '0')}`;
  return span;
}

function makeRemoveButton(onClick) {
  const btn = document.createElement('button');
  btn.className = 'remove';
  btn.textContent = 'Remove';
  btn.addEventListener('click', onClick);
  return btn;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function wrapLon(v) { return ((v + 180) % 360 + 360) % 360 - 180; }

// ---------- resize + render loop ----------

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();

function tick() {
  const dt = clock.getDelta();

  if (!paused) {
    // Rotate the whole earth frame (Earth body, clouds, ground stations).
    earthFrame.rotation.y += THREE.MathUtils.degToRad(earthRateDegPerSec) * dt;

    // Advance each satellite along its orbit (inertial frame, independent of Earth's spin).
    for (const s of satellites) s.sat.tick(dt);

    // Decide which satellites are inside which cones and update visuals.
    updateVisibility();
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------- seed examples so the scene isn't empty on first load ----------

addPoint({ lat: 51.5074, lon: -0.1278,   halfAngle: 60, label: 'London' });
addPoint({ lat: -23.5505, lon: -46.6333, halfAngle: 45, label: 'São Paulo' });
addPoint({ lat: 35.6762, lon: 139.6503,  halfAngle: 30, label: 'Tokyo' });

addSatellite({ name: 'ISS-ish',   altitude: 0.08, inclination: 51.6, raan:   0, omega: 60, alpha: 0 });
addSatellite({ name: 'Polar',     altitude: 0.15, inclination: 90,   raan:  60, omega: 45, alpha: 0 });
addSatellite({ name: 'Equator',   altitude: 0.30, inclination: 0,    raan:   0, omega: 30, alpha: 0 });

// Expose for tinkering in the devtools console.
window.__app = {
  scene, camera, points, satellites, addPoint, removePoint,
  addSatellite, removeSatellite, resetSatellites,
  setEarthRate: (v) => { earthRateDegPerSec = v; earthRateInput.value = v; },
};
