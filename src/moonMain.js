import * as THREE from 'three';

import { createScene } from './sceneSetup.js';
import { createMoon } from './moon.js';
import { MOON, EARTH } from './bodies.js';
import { createBodyMarker } from './bodyMarker.js';
import { createGroundPoints } from './groundPoints.js';
import { createSyntheticSats } from './syntheticSats.js';
import { initSatelliteForm } from './satelliteForm.js';
import { initPropagationForm } from './propagationForm.js';
import { thirdBodiesFor } from './ephemeris.js';
import { fromCircular } from './orbit.js';
import { updateVisibility } from './visibility.js';
import { initPageChrome } from './pageChrome.js';
import { clamp, wrapLon } from './uiHelpers.js';
import { LUNAR_PRESETS, renderPresetList } from './lunarPresets.js';

// ---------- scene setup ----------

const canvas = document.getElementById('scene');
// Lunar orbiters sit close to the surface, so no GEO-distance headroom is
// needed; the regolith is dark, so ambient/sun are nudged up vs Earth.
const { scene, camera, controls, start } = createScene(canvas, {
  cameraPosition: [0, 1.4, 4],
  maxDistance: 20,
  ambientIntensity: 0.45,
  sunIntensity: 1.25,
});

const moonFrame = new THREE.Group();
scene.add(moonFrame);
moonFrame.add(createMoon());

const pointsRoot = new THREE.Group();
moonFrame.add(pointsRoot);

const satellitesRoot = new THREE.Group();
scene.add(satellitesRoot);

// ---------- sim clock ----------
let simTime = new Date();
const simSeconds = () => simTime.getTime() / 1000;

// ---------- ground points & synthetic satellites ----------

const groundPoints = createGroundPoints({
  parent: pointsRoot,
  listEl: document.getElementById('points'),
});

const thirdBodies = thirdBodiesFor(MOON);

const syntheticSats = createSyntheticSats({
  parent: satellitesRoot,
  listEl: document.getElementById('satellites'),
  body: MOON,
  thirdBodies,
});

initSatelliteForm({
  mount: document.getElementById('sat-form-mount'),
  body: MOON,
  onAdd: (orbit, name) => syntheticSats.add({ name, orbit, epochSec: simSeconds() }),
});

initPropagationForm({
  mount: document.getElementById('prop-mount'),
  thirdBodyNames: thirdBodies.map((t) => t.name),
  onChange: (cfg) => syntheticSats.setPropagator(cfg, simSeconds()),
});

// ---------- Earth (third body) marker ----------
// Shown by default in Earth's true direction; "to scale" places it at its real
// distance/size and widens the zoom range. Same ephemeris that drives gravity.
const earthMarker = createBodyMarker({
  parent: scene,
  positionAtKm: thirdBodies.find((b) => b.name === 'Earth').positionAt,
  sceneScaleKm: MOON.radiusKm,
  realRadiusKm: EARTH.radiusKm,
  texturePath: `${import.meta.env.BASE_URL}textures/earth_day.jpg`,
});

let earthToScale = false;
const earthScaleBox = document.getElementById('earthToScale');
earthScaleBox.addEventListener('change', () => {
  earthToScale = earthScaleBox.checked;
  controls.maxDistance = earthToScale ? 400 : 20;
});

// Stable single group (no live satellites on the Moon page) reused every frame.
const visibilityGroups = [syntheticSats.getTargets()];
function runVisibility() {
  updateVisibility(groundPoints.getConeStates(), visibilityGroups);
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

// ---------- UI: lunar orbiter presets ----------

function addPreset(p) {
  syntheticSats.add({
    name: p.name,
    orbit: fromCircular({ altitudeKm: p.altitudeKm, incDeg: p.incDeg, raanDeg: p.raanDeg }, MOON.muKm3s2, MOON.radiusKm),
    epochSec: simSeconds(),
  });
}
renderPresetList(document.getElementById('lunar-presets'), LUNAR_PRESETS, addPreset);

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

function formatSimTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ---------- render loop ----------

let lastUiTimeUpdate = 0;

start((dt) => {
  earthMarker.update(simSeconds(), earthToScale);
  if (paused) return;
  simTime = new Date(simTime.getTime() + dt * 1000 * timeMultiplier);
  moonFrame.rotation.y += THREE.MathUtils.degToRad(moonRateDegPerSec) * dt;
  syntheticSats.tick(simSeconds());
  runVisibility();
  if (performance.now() - lastUiTimeUpdate > 500) {
    lastUiTimeUpdate = performance.now();
    simTimeEl.textContent = formatSimTime(simTime);
  }
});

// ---------- seed examples ----------

groundPoints.add({ lat: 0.67,  lon: 23.47, halfAngle: 50, label: 'Tranquility Base' });
groundPoints.add({ lat: -85,   lon: 0,     halfAngle: 40, label: 'South Pole stn' });

addPreset(LUNAR_PRESETS[0]); // LRO
addPreset(LUNAR_PRESETS[1]); // Chandrayaan-2

// Wire the glass dock + help chrome (panels are declared in moon.html).
initPageChrome();

// Expose for tinkering.
window.__moon = {
  scene, camera, controls, earthMarker, groundPoints, syntheticSats,
  get simTime() { return simTime; },
  set simTime(d) { simTime = new Date(d); },
  setTimeMultiplier: (v) => { timeMultiplier = v; timeMultInput.value = v; },
};
