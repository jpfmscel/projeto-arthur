import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createEarth } from './earth.js';
import { createStarfield } from './stars.js';
import { createViewCone } from './viewCone.js';
import { createSatellite, pointInsideCone } from './satellite.js';
import {
  GROUPS as LIVE_GROUPS,
  fetchGroup as fetchLiveGroup,
  createLiveSatellite,
  gmstRad,
} from './liveSatellites.js';

const MAX_LIVE = 5;

// ---------- scene setup ----------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x05070d, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// FOV / position chosen so Earth occupies a comfortable portion of the
// screen at startup while leaving headroom for MEO/GEO satellites
// (GPS at ~4 R, GEO at ~6.6 R from Earth center).
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(0, 2, 8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.1;
controls.maxDistance = 40;

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(5, 3, 4);
scene.add(sun);

scene.add(createStarfield());

// The earth frame rotates with the planet. Ground stations and the cloud
// layer are children, so they all rotate together. Satellites — synthetic or
// live — live in the inertial world frame.
const earthFrame = new THREE.Group();
scene.add(earthFrame);

const earth = createEarth();
earthFrame.add(earth);

const pointsRoot = new THREE.Group();
earthFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group(); // synthetic
scene.add(satellitesRoot);
const liveRoot = new THREE.Group();       // TLE-driven
scene.add(liveRoot);

// ---------- ground points (view cones) ----------

const points = [];
const palette = [0x6ec1ff, 0xffb86c, 0x9af07a, 0xff79c6, 0xf1fa8c, 0xbd93f9, 0xff5555, 0x8be9fd];
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

// ---------- synthetic satellites ----------

const satellites = [];
const satPalette = [0xffd166, 0x06d6a0, 0xef476f, 0x118ab2, 0x8338ec, 0xfb5607, 0x80ed99, 0xff006e];
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

// ---------- live (TLE) satellites ----------

const liveTracking = []; // [{ noradId, name, color, live }]
const livePalette = [0x6ee7ff, 0xffcb6e, 0xff6e9d, 0xb6ff6e, 0xc56eff];
let liveColorIdx = 0;
let liveGroupRecords = []; // last fetched group
let liveCurrentGroup = LIVE_GROUPS[0].id;

async function loadLiveGroup(groupId) {
  liveCurrentGroup = groupId;
  setLiveStatus('Loading…');
  try {
    liveGroupRecords = await fetchLiveGroup(groupId);
    setLiveStatus(`${liveGroupRecords.length} satellites in “${groupId}”`);
  } catch (e) {
    liveGroupRecords = [];
    setLiveStatus(`Failed to load: ${e.message}. `, true);
  }
  renderAvailable();
}

function setLiveStatus(msg, isError = false) {
  liveStatusEl.textContent = msg;
  liveStatusEl.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  if (isError) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Retry';
    btn.className = 'remove';
    btn.style.marginLeft = '6px';
    btn.addEventListener('click', () => loadLiveGroup(liveCurrentGroup));
    liveStatusEl.appendChild(btn);
  }
}

function trackLive(record) {
  if (liveTracking.length >= MAX_LIVE) return;
  if (liveTracking.some((t) => t.noradId === record.noradId)) return;
  const color = livePalette[liveColorIdx++ % livePalette.length];
  const live = createLiveSatellite({ record, color });
  if (!live) return;
  liveRoot.add(live.group);
  liveTracking.push({ noradId: record.noradId, name: record.name, color, live });
  renderAvailable();
  renderTracking();
}

function untrackLive(noradId) {
  const idx = liveTracking.findIndex((t) => t.noradId === noradId);
  if (idx === -1) return;
  const [removed] = liveTracking.splice(idx, 1);
  liveRoot.remove(removed.live.group);
  removed.live.dispose();
  renderAvailable();
  renderTracking();
}

// ---------- per-frame visibility hit test ----------

const _apex = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up   = new THREE.Vector3(0, 1, 0);
const _wp   = new THREE.Vector3();

function updateVisibility() {
  const coneState = points.map((p) => {
    p.cone.cone.getWorldPosition(_apex);
    p.cone.cone.getWorldQuaternion(_quat);
    const axis = _up.clone().applyQuaternion(_quat).normalize();
    p.cone.setActive(false);
    return { apex: _apex.clone(), axis, cosHalfAngle: p.cone.cosHalfAngle, point: p };
  });

  for (const s of satellites) {
    s.sat.satMesh.getWorldPosition(_wp);
    let insideAny = false;
    for (const c of coneState) {
      if (pointInsideCone(_wp, c.apex, c.axis, c.cosHalfAngle)) {
        c.point.cone.setActive(true);
        insideAny = true;
      }
    }
    s.sat.setHighlighted(insideAny);
  }

  for (const t of liveTracking) {
    if (!t.live.dot.visible) continue;
    t.live.dot.getWorldPosition(_wp);
    let insideAny = false;
    for (const c of coneState) {
      if (pointInsideCone(_wp, c.apex, c.axis, c.cosHalfAngle)) {
        c.point.cone.setActive(true);
        insideAny = true;
      }
    }
    t.live.setHighlighted(insideAny);
  }
}

// ---------- UI: ground points form ----------

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
    meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
    meta.querySelector('.name').textContent = p.label || `Point ${p.id}`;
    meta.querySelector('.coords').textContent =
      `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}° · FOV ${p.halfAngle}°`;
    li.appendChild(meta);
    li.appendChild(makeRemoveButton(() => removePoint(p.id)));
    pointsList.appendChild(li);
  }
}

// ---------- UI: synthetic satellites form ----------

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
    meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
    meta.querySelector('.name').textContent = s.name;
    const { altitude, inclination, raan, omega, alpha } = s.params;
    meta.querySelector('.coords').textContent =
      `alt ${altitude} · inc ${inclination}° · RAAN ${raan}° · ω ${omega}°/s${alpha ? ` · α ${alpha}°/s²` : ''}`;
    li.appendChild(meta);
    li.appendChild(makeRemoveButton(() => removeSatellite(s.id)));
    satsList.appendChild(li);
  }
}

// ---------- UI: live satellites ----------

const liveGroupSel    = document.getElementById('liveGroup');
const liveSearchInput = document.getElementById('liveSearch');
const liveStatusEl    = document.getElementById('live-status');
const liveAvailableEl = document.getElementById('live-available');
const liveTrackingEl  = document.getElementById('live-tracking');
const liveCountEl     = document.getElementById('live-count');
const liveMultInput   = document.getElementById('liveMult');
const liveTimeEl      = document.getElementById('live-time');

for (const g of LIVE_GROUPS) {
  const opt = document.createElement('option');
  opt.value = g.id;
  opt.textContent = g.name;
  opt.title = g.desc;
  liveGroupSel.appendChild(opt);
}
liveGroupSel.value = LIVE_GROUPS[0].id;

liveGroupSel.addEventListener('change', () => {
  liveSearchInput.value = '';
  loadLiveGroup(liveGroupSel.value);
});
liveSearchInput.addEventListener('input', renderAvailable);

function renderAvailable() {
  liveAvailableEl.innerHTML = '';
  const q = liveSearchInput.value.trim().toLowerCase();
  const tracked = new Set(liveTracking.map((t) => t.noradId));
  const maxRows = 100;
  let shown = 0;
  for (const rec of liveGroupRecords) {
    if (shown >= maxRows) break;
    if (q && !rec.name.toLowerCase().includes(q) && !rec.noradId.includes(q)) continue;
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = tracked.has(rec.noradId);
    const atCap = liveTracking.length >= MAX_LIVE && !cb.checked;
    cb.disabled = atCap;
    if (atCap) li.classList.add('disabled');
    cb.addEventListener('change', () => {
      if (cb.checked) trackLive(rec); else untrackLive(rec.noradId);
    });
    const name = document.createElement('span');
    name.className = 'sat-name';
    name.textContent = rec.name;
    const id = document.createElement('span');
    id.className = 'sat-id';
    id.textContent = rec.noradId;
    li.appendChild(cb);
    li.appendChild(name);
    li.appendChild(id);
    liveAvailableEl.appendChild(li);
    shown += 1;
  }
  if (liveGroupRecords.length > maxRows) {
    const li = document.createElement('li');
    li.style.color = 'var(--muted)';
    li.style.fontStyle = 'italic';
    const filtered = q ? ` matching “${q}”` : '';
    li.textContent = `Showing first ${maxRows}${filtered} of ${liveGroupRecords.length}. Refine your search.`;
    liveAvailableEl.appendChild(li);
  }
}

function renderTracking() {
  liveCountEl.textContent = String(liveTracking.length);
  liveTrackingEl.innerHTML = '';
  for (const t of liveTracking) {
    const li = document.createElement('li');
    li.appendChild(makeSwatch(t.color));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
    meta.querySelector('.name').textContent = t.name;
    meta.querySelector('.coords').textContent = `NORAD ${t.noradId}`;
    li.appendChild(meta);
    li.appendChild(makeRemoveButton(() => untrackLive(t.noradId)));
    liveTrackingEl.appendChild(li);
  }
}

let timeMultiplier = parseFloat(liveMultInput.value) || 60;
liveMultInput.addEventListener('change', () => {
  const v = parseFloat(liveMultInput.value);
  if (!Number.isNaN(v) && v >= 1) timeMultiplier = v;
});

// ---------- UI: simulation controls ----------

document.getElementById('reset-orbits').addEventListener('click', () => {
  resetSatellites();
  for (const t of liveTracking) t.live.clearTrail();
});

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

function formatSimTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

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
let simTime = new Date();
let lastUiTimeUpdate = 0;

function tick() {
  const dt = clock.getDelta();

  if (!paused) {
    // Advance sim clock (used by live satellite propagation).
    simTime = new Date(simTime.getTime() + dt * 1000 * timeMultiplier);

    // Earth rotation: GMST-driven when live tracking is active; otherwise
    // the user's manual rate.
    const liveActive = liveTracking.length > 0;
    if (liveActive) {
      earthFrame.rotation.y = gmstRad(simTime);
    } else {
      earthFrame.rotation.y += THREE.MathUtils.degToRad(earthRateDegPerSec) * dt;
    }
    earthRateInput.disabled = liveActive;

    // Synthetic satellites: their own clock ticks per-frame.
    for (const s of satellites) s.sat.tick(dt);

    // Live satellites: propagate to current simTime.
    for (const t of liveTracking) t.live.tick(simTime);

    updateVisibility();

    // Update the UTC display ~once a second to keep DOM noise low.
    if (performance.now() - lastUiTimeUpdate > 500) {
      lastUiTimeUpdate = performance.now();
      liveTimeEl.textContent = formatSimTime(simTime);
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------- seed examples ----------

addPoint({ lat: 51.5074, lon: -0.1278,   halfAngle: 60, label: 'London' });
addPoint({ lat: -23.5505, lon: -46.6333, halfAngle: 45, label: 'São Paulo' });
addPoint({ lat: 35.6762, lon: 139.6503,  halfAngle: 30, label: 'Tokyo' });

// Defaults use realistic LEO altitudes (units of Earth radii):
//   ISS  ≈ 408 km → 0.064
//   Sun-sync sat ≈ 700 km → 0.110
//   Medium-altitude ≈ 1 500 km → 0.235
// The synthetic ω values are still arbitrary "sim-time deg/s" so motion
// remains visible without tweaking the time multiplier.
addSatellite({ name: 'ISS-ish',   altitude: 0.064, inclination: 51.6, raan:  0, omega: 30, alpha: 0 });
addSatellite({ name: 'Sun-sync',  altitude: 0.110, inclination: 98,   raan: 30, omega: 25, alpha: 0 });
addSatellite({ name: 'MEO-ish',   altitude: 0.235, inclination: 0,    raan:  0, omega: 18, alpha: 0 });

// Kick off the initial Celestrak fetch.
loadLiveGroup(LIVE_GROUPS[0].id);

// Expose for tinkering.
window.__app = {
  scene, camera, points, satellites, liveTracking,
  addPoint, removePoint, addSatellite, removeSatellite, resetSatellites,
  trackLive, untrackLive, loadLiveGroup,
  get simTime() { return simTime; },
  set simTime(d) { simTime = new Date(d); },
  setEarthRate: (v) => { earthRateDegPerSec = v; earthRateInput.value = v; },
  setTimeMultiplier: (v) => { timeMultiplier = v; liveMultInput.value = v; },
};
