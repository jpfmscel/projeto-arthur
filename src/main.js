import * as THREE from 'three';

import { createScene } from './sceneSetup.js';
import { createEarth } from './earth.js';
import { createGroundPoints } from './groundPoints.js';
import { createSyntheticSats } from './syntheticSats.js';
import { updateVisibility } from './visibility.js';
import { initPageChrome } from './pageChrome.js';
import { clamp, wrapLon, makeSwatch, makeRemoveButton } from './uiHelpers.js';
import {
  GROUPS as LIVE_GROUPS,
  fetchGroup as fetchLiveGroup,
  createLiveSatellite,
  gmstRad,
} from './liveSatellites.js';

const MAX_LIVE = 5;

// ---------- scene setup ----------

const canvas = document.getElementById('scene');
// FOV / camera distance leave headroom for MEO/GEO satellites
// (GPS at ~4 R, GEO at ~6.6 R from Earth center).
const { scene, start } = createScene(canvas);

// The earth frame rotates with the planet. Ground stations and the cloud
// layer are children, so they all rotate together. Satellites — synthetic or
// live — live in the inertial world frame.
const earthFrame = new THREE.Group();
scene.add(earthFrame);

earthFrame.add(createEarth());

const pointsRoot = new THREE.Group();
earthFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group(); // synthetic
scene.add(satellitesRoot);
const liveRoot = new THREE.Group();       // TLE-driven
scene.add(liveRoot);

// ---------- ground points & synthetic satellites (shared stores) ----------

const groundPoints = createGroundPoints({
  parent: pointsRoot,
  listEl: document.getElementById('points'),
});

const syntheticSats = createSyntheticSats({
  parent: satellitesRoot,
  listEl: document.getElementById('satellites'),
});

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

// Adapt live satellites to the visibility hit-test's target interface. A live
// sat hides itself when SGP4 yields no position, so it reports `isVisible`.
function liveTargets() {
  return liveTracking.map((t) => ({
    getWorldPosition: (out) => t.live.dot.getWorldPosition(out),
    setHighlighted: (on) => t.live.setHighlighted(on),
    isVisible: () => t.live.dot.visible,
  }));
}

function runVisibility() {
  updateVisibility(groundPoints.getConeStates(), [
    ...syntheticSats.getTargets(),
    ...liveTargets(),
  ]);
}

// ---------- UI: ground points form ----------

const pointForm = document.getElementById('add-point-form');
const ptLat = document.getElementById('lat');
const ptLon = document.getElementById('lon');
const ptHalfAngle = document.getElementById('halfAngle');
const ptLabel = document.getElementById('label');

pointForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const lat = clamp(parseFloat(ptLat.value), -90, 90);
  const lon = wrapLon(parseFloat(ptLon.value));
  const halfAngle = clamp(parseFloat(ptHalfAngle.value), 1, 89);
  const label = ptLabel.value.trim();
  if ([lat, lon, halfAngle].some(Number.isNaN)) return;
  groundPoints.add({ lat, lon, halfAngle, label });
  ptLabel.value = '';
});

// ---------- UI: synthetic satellites form ----------

const satForm = document.getElementById('add-sat-form');
const satName = document.getElementById('satName');
const satAlt = document.getElementById('satAlt');
const satInc = document.getElementById('satInc');
const satRaan = document.getElementById('satRaan');
const satOmega = document.getElementById('satOmega');
const satAlpha = document.getElementById('satAlpha');

satForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const altitude = clamp(parseFloat(satAlt.value), 0.01, 20);
  const inclination = clamp(parseFloat(satInc.value), 0, 180);
  const raan = wrapLon(parseFloat(satRaan.value));
  const omega = parseFloat(satOmega.value);
  const alpha = parseFloat(satAlpha.value);
  if ([altitude, inclination, raan, omega, alpha].some(Number.isNaN)) return;
  syntheticSats.add({ name: satName.value.trim(), altitude, inclination, raan, omega, alpha });
  satName.value = '';
});

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
  syntheticSats.reset();
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

function formatSimTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ---------- render loop ----------

let simTime = new Date();
let lastUiTimeUpdate = 0;

start((dt) => {
  if (paused) return;

  // Advance sim clock (used by live satellite propagation).
  simTime = new Date(simTime.getTime() + dt * 1000 * timeMultiplier);

  // Earth rotation: GMST-driven when live tracking is active; otherwise the
  // user's manual rate.
  const liveActive = liveTracking.length > 0;
  if (liveActive) {
    earthFrame.rotation.y = gmstRad(simTime);
  } else {
    earthFrame.rotation.y += THREE.MathUtils.degToRad(earthRateDegPerSec) * dt;
  }
  earthRateInput.disabled = liveActive;

  // Synthetic satellites: their own clock ticks per-frame.
  syntheticSats.tick(dt);

  // Live satellites: propagate to current simTime.
  for (const t of liveTracking) t.live.tick(simTime);

  runVisibility();

  // Update the UTC display ~once a second to keep DOM noise low.
  if (performance.now() - lastUiTimeUpdate > 500) {
    lastUiTimeUpdate = performance.now();
    liveTimeEl.textContent = formatSimTime(simTime);
  }
});

// ---------- seed examples ----------

groundPoints.add({ lat: 51.5074, lon: -0.1278,   halfAngle: 60, label: 'London' });
groundPoints.add({ lat: -23.5505, lon: -46.6333, halfAngle: 45, label: 'São Paulo' });
groundPoints.add({ lat: 35.6762, lon: 139.6503,  halfAngle: 30, label: 'Tokyo' });

// Defaults use realistic LEO altitudes (units of Earth radii):
//   ISS  ≈ 408 km → 0.064
//   Sun-sync sat ≈ 700 km → 0.110
//   Medium-altitude ≈ 1 500 km → 0.235
// The synthetic ω values are still arbitrary "sim-time deg/s" so motion
// remains visible without tweaking the time multiplier.
syntheticSats.add({ name: 'ISS-ish',   altitude: 0.064, inclination: 51.6, raan:  0, omega: 30, alpha: 0 });
syntheticSats.add({ name: 'Sun-sync',  altitude: 0.110, inclination: 98,   raan: 30, omega: 25, alpha: 0 });
syntheticSats.add({ name: 'MEO-ish',   altitude: 0.235, inclination: 0,    raan:  0, omega: 18, alpha: 0 });

// Kick off the initial Celestrak fetch.
loadLiveGroup(LIVE_GROUPS[0].id);

// Wire the glass dock + help chrome (panels are declared in index.html).
initPageChrome();

// Expose for tinkering.
window.__app = {
  scene, groundPoints, syntheticSats, liveTracking,
  trackLive, untrackLive, loadLiveGroup,
  get simTime() { return simTime; },
  set simTime(d) { simTime = new Date(d); },
  setEarthRate: (v) => { earthRateDegPerSec = v; earthRateInput.value = v; },
  setTimeMultiplier: (v) => { timeMultiplier = v; liveMultInput.value = v; },
};
