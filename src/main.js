import * as THREE from 'three';

import { createScene } from './sceneSetup.js';
import { createEarth } from './earth.js';
import { EARTH } from './bodies.js';
import { createGroundPoints } from './groundPoints.js';
import { createSyntheticSats } from './syntheticSats.js';
import { initSatelliteForm } from './satelliteForm.js';
import { initPropagationForm } from './propagationForm.js';
import { thirdBodiesFor } from './ephemeris.js';
import { createLabelOverlay } from './labels.js';
import { fromCircular, fromKeplerian } from './orbit.js';
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
const { scene, renderer, camera, start } = createScene(canvas);

// The earth frame rotates with the planet; ground stations are children.
// Satellites — synthetic or live — live in the inertial world frame.
const earthFrame = new THREE.Group();
scene.add(earthFrame);
earthFrame.add(createEarth());

const pointsRoot = new THREE.Group();
earthFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group(); // synthetic (two-body)
scene.add(satellitesRoot);
const liveRoot = new THREE.Group();       // TLE-driven
scene.add(liveRoot);

// ---------- sim clock ----------
// simTime drives both synthetic two-body orbits and live SGP4 propagation.
let simTime = new Date();
const simSeconds = () => simTime.getTime() / 1000;

// ---------- ground points & synthetic satellites (shared stores) ----------

const groundPoints = createGroundPoints({
  parent: pointsRoot,
  listEl: document.getElementById('points'),
});

const thirdBodies = thirdBodiesFor(EARTH);

const syntheticSats = createSyntheticSats({
  parent: satellitesRoot,
  listEl: document.getElementById('satellites'),
  body: EARTH,
  thirdBodies,
});

initSatelliteForm({
  mount: document.getElementById('sat-form-mount'),
  body: EARTH,
  onAdd: (orbit, name) => syntheticSats.add({ name, orbit, epochSec: simSeconds() }),
});

initPropagationForm({
  mount: document.getElementById('prop-mount'),
  thirdBodyNames: thirdBodies.map((t) => t.name),
  onChange: (cfg) => syntheticSats.setPropagator(cfg, simSeconds()),
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
  refreshLiveTargets();
  renderAvailable();
  renderTracking();
}

function untrackLive(noradId) {
  const idx = liveTracking.findIndex((t) => t.noradId === noradId);
  if (idx === -1) return;
  const [removed] = liveTracking.splice(idx, 1);
  liveRoot.remove(removed.live.group);
  removed.live.dispose();
  refreshLiveTargets();
  renderAvailable();
  renderTracking();
}

// Live-target adapters, cached in place and rebuilt only on track/untrack so
// the per-frame visibility test allocates nothing.
const liveTargetsArr = [];
const liveLabelsArr = [];
function refreshLiveTargets() {
  liveTargetsArr.length = 0;
  liveLabelsArr.length = 0;
  for (const t of liveTracking) {
    liveTargetsArr.push({
      getWorldPosition: (out) => t.live.dot.getWorldPosition(out),
      setHighlighted: (on) => t.live.setHighlighted(on),
      isVisible: () => t.live.dot.visible,
    });
    liveLabelsArr.push({
      getWorldPosition: (out) => t.live.dot.getWorldPosition(out),
      name: t.name,
      details: () => {
        const alt = t.live.dot.getWorldPosition(new THREE.Vector3()).length() * EARTH.radiusKm - EARTH.radiusKm;
        return `NORAD ${t.noradId} · alt ${alt.toFixed(0)} km`;
      },
    });
  }
}

// Stable grouping (synthetic + live) reused every frame.
const visibilityGroups = [syntheticSats.getTargets(), liveTargetsArr];
function runVisibility() {
  updateVisibility(groundPoints.getConeStates(), visibilityGroups);
}

// Tracking labels: ground points + synthetic + live (cached arrays).
const labelOverlay = createLabelOverlay({
  container: document.getElementById('labels'),
  camera,
  canvas,
  groups: [groundPoints.getLabelTargets(), syntheticSats.getLabelTargets(), liveLabelsArr],
});

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

// ---------- UI: live satellites ----------

const liveGroupSel    = document.getElementById('liveGroup');
const liveSearchInput = document.getElementById('liveSearch');
const liveStatusEl    = document.getElementById('live-status');
const liveAvailableEl = document.getElementById('live-available');
const liveTrackingEl  = document.getElementById('live-tracking');
const liveCountEl     = document.getElementById('live-count');

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

// ---------- UI: simulation controls ----------

const timeMultInput = document.getElementById('timeMult');
let timeMultiplier = parseFloat(timeMultInput.value) || 60;
timeMultInput.addEventListener('change', () => {
  const v = parseFloat(timeMultInput.value);
  if (!Number.isNaN(v) && v >= 1) timeMultiplier = v;
});

const simTimeEl = document.getElementById('sim-time');

document.getElementById('reset-orbits').addEventListener('click', () => {
  syntheticSats.reset(simSeconds());
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

let lastUiTimeUpdate = 0;

start((dt) => {
  labelOverlay.update();
  if (paused) return;

  simTime = new Date(simTime.getTime() + dt * 1000 * timeMultiplier);

  // Earth rotation: GMST-driven when live tracking is active; else manual rate.
  const liveActive = liveTracking.length > 0;
  if (liveActive) {
    earthFrame.rotation.y = gmstRad(simTime);
  } else {
    earthFrame.rotation.y += THREE.MathUtils.degToRad(earthRateDegPerSec) * dt;
  }
  earthRateInput.disabled = liveActive;

  syntheticSats.tick(simSeconds());
  for (const t of liveTracking) t.live.tick(simTime);

  runVisibility();

  if (performance.now() - lastUiTimeUpdate > 500) {
    lastUiTimeUpdate = performance.now();
    simTimeEl.textContent = formatSimTime(simTime);
  }
});

// ---------- seed examples ----------

groundPoints.add({ lat: 51.5074, lon: -0.1278,   halfAngle: 60, label: 'London' });
groundPoints.add({ lat: -23.5505, lon: -46.6333, halfAngle: 45, label: 'São Paulo' });
groundPoints.add({ lat: 35.6762, lon: 139.6503,  halfAngle: 30, label: 'Tokyo' });

// Real LEO orbits (altitude km, real periods). At Time ×60 a ~92 min orbit
// takes ~92 s of wall-clock — visible without further tweaking.
syntheticSats.add({ name: 'ISS-ish',  orbit: fromCircular({ altitudeKm: 420,  incDeg: 51.6, raanDeg: 0 },  EARTH.muKm3s2, EARTH.radiusKm), epochSec: simSeconds() });
syntheticSats.add({ name: 'Sun-sync', orbit: fromCircular({ altitudeKm: 700,  incDeg: 98,   raanDeg: 30 }, EARTH.muKm3s2, EARTH.radiusKm), epochSec: simSeconds() });
syntheticSats.add({ name: 'MEO-ish',  orbit: fromCircular({ altitudeKm: 1500, incDeg: 0,    raanDeg: 0 },  EARTH.muKm3s2, EARTH.radiusKm), epochSec: simSeconds() });

// Kick off the initial Celestrak fetch.
loadLiveGroup(LIVE_GROUPS[0].id);

// Wire the glass dock + help chrome (panels are declared in index.html).
initPageChrome();

// Bulk-add random valid orbits — for performance measurement (not in the UI).
function addRandomSats(n) {
  const specs = [];
  for (let k = 0; k < n; k++) {
    const orbit = fromKeplerian({
      aKm: EARTH.radiusKm + 400 + (k * 53) % 3000,
      e: 0,
      incDeg: (k * 13) % 180,
      raanDeg: (k * 47) % 360,
      argpDeg: 0,
      nuDeg: (k * 29) % 360,
    }, EARTH.muKm3s2);
    if (orbit.valid) specs.push({ name: `R${k}`, orbit, epochSec: simSeconds() });
  }
  syntheticSats.addMany(specs);
  return syntheticSats.count;
}

// Expose for tinkering.
window.__app = {
  scene, renderer, groundPoints, syntheticSats, liveTracking, addRandomSats,
  trackLive, untrackLive, loadLiveGroup,
  get simTime() { return simTime; },
  set simTime(d) { simTime = new Date(d); },
  setTimeMultiplier: (v) => { timeMultiplier = v; timeMultInput.value = v; },
};
