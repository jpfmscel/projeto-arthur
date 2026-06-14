import * as THREE from 'three';

import { createScene } from './sceneSetup.js';
import { createMoon } from './moon.js';
import { createGroundPoints } from './groundPoints.js';
import { createSyntheticSats } from './syntheticSats.js';
import { updateVisibility } from './visibility.js';
import { clamp, wrapLon } from './uiHelpers.js';
import { LUNAR_PRESETS, renderPresetList } from './lunarPresets.js';

// ---------- scene setup ----------

const canvas = document.getElementById('scene');
// Lunar orbiters sit very close to the surface (< 0.1 R_Moon), so there is no
// need for the Earth page's GEO-distance headroom — pull the camera in and cap
// the zoom-out tighter. The regolith is dark (albedo ~0.12), so the ambient/sun
// are nudged up a touch versus Earth so the surface reads well.
const { scene, start } = createScene(canvas, {
  cameraPosition: [0, 1.4, 4],
  maxDistance: 20,
  ambientIntensity: 0.45,
  sunIntensity: 1.25,
});

// The moon frame rotates with the body; ground stations are children so they
// rotate with it. Satellites live in the inertial world frame.
const moonFrame = new THREE.Group();
scene.add(moonFrame);

moonFrame.add(createMoon());

const pointsRoot = new THREE.Group();
moonFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group();
scene.add(satellitesRoot);

// ---------- ground points & synthetic satellites (shared stores) ----------

const groundPoints = createGroundPoints({
  parent: pointsRoot,
  listEl: document.getElementById('points'),
});

const syntheticSats = createSyntheticSats({
  parent: satellitesRoot,
  listEl: document.getElementById('satellites'),
});

function runVisibility() {
  updateVisibility(groundPoints.getConeStates(), syntheticSats.getTargets());
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

// ---------- UI: lunar orbiter presets ----------

renderPresetList(
  document.getElementById('lunar-presets'),
  LUNAR_PRESETS,
  (preset) => syntheticSats.add({ ...preset }),
);

// ---------- UI: simulation controls ----------

document.getElementById('reset-orbits').addEventListener('click', () => {
  syntheticSats.reset();
});

const moonRateInput = document.getElementById('moonRate');
let moonRateDegPerSec = parseFloat(moonRateInput.value);
moonRateInput.addEventListener('change', () => {
  const v = parseFloat(moonRateInput.value);
  if (!Number.isNaN(v)) moonRateDegPerSec = v;
});

const pauseBtn = document.getElementById('pause');
let paused = false;
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
});

// ---------- render loop ----------

start((dt) => {
  if (paused) return;
  moonFrame.rotation.y += THREE.MathUtils.degToRad(moonRateDegPerSec) * dt;
  syntheticSats.tick(dt);
  runVisibility();
});

// ---------- seed examples ----------

// A couple of lunar surface stations. Apollo 11 landed at Mare Tranquillitatis
// (0.67°N, 23.47°E); the second sits near the south-pole region of interest.
groundPoints.add({ lat: 0.67,  lon: 23.47, halfAngle: 50, label: 'Tranquility Base' });
groundPoints.add({ lat: -85,   lon: 0,     halfAngle: 40, label: 'South Pole stn' });

// Seed two presets so the scene isn't empty on load.
syntheticSats.add({ ...LUNAR_PRESETS[0] }); // LRO
syntheticSats.add({ ...LUNAR_PRESETS[1] }); // Chandrayaan-2

// Expose for tinkering.
window.__moon = {
  scene, groundPoints, syntheticSats,
  setMoonRate: (v) => { moonRateDegPerSec = v; moonRateInput.value = v; },
};
