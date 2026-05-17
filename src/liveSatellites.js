import * as satellite from 'satellite.js';
import * as THREE from 'three';

// Equatorial Earth radius. SGP4 returns position in km; we scale by this so
// 1 scene unit == 1 Earth radius (matches EARTH_RADIUS in earth.js).
const R_EARTH_KM = 6378.137;

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const CACHE_TTL_MS   = 12 * 60 * 60 * 1000;
const TRAIL_LEN      = 240;
const TRAIL_INTERVAL_MS = 30_000;

// A small curated list of Celestrak groups. Easy to extend later — every
// `id` here is a valid `GROUP` parameter on https://celestrak.org/NORAD/elements/gp.php
export const GROUPS = [
  { id: 'stations',  name: 'Space stations',    desc: 'ISS, CSS, Tiangong (~15)' },
  { id: 'active',    name: 'Active satellites', desc: 'All operational (~10k)' },
  { id: 'gps-ops',   name: 'GPS',               desc: 'GPS constellation (~30)' },
  { id: 'glo-ops',   name: 'GLONASS',           desc: 'GLONASS constellation (~25)' },
  { id: 'galileo',   name: 'Galileo',           desc: 'Galileo constellation (~30)' },
  { id: 'weather',   name: 'Weather',           desc: 'NOAA, Meteosat etc.' },
  { id: 'science',   name: 'Science',           desc: 'Hubble & friends' },
  { id: 'starlink',  name: 'Starlink',          desc: 'Starlink constellation (~6k)' },
];

/**
 * Fetch TLEs for a Celestrak group. Cached in localStorage for 12 h.
 * Returns: Array<{ name, line1, line2, noradId }>
 */
export async function fetchGroup(groupId) {
  const cacheKey = `celestrak:${groupId}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.t < CACHE_TTL_MS) return cached.records;
    }
  } catch { /* corrupt cache, ignore */ }

  const url = `${CELESTRAK_BASE}?GROUP=${encodeURIComponent(groupId)}&FORMAT=tle`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Celestrak ${res.status} ${res.statusText}`);
  const text = await res.text();
  const records = parseTleListing(text);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), records }));
  } catch { /* quota, ignore */ }

  return records;
}

function parseTleListing(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name  = lines[i].trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
    const noradId = line1.slice(2, 7).trim();
    out.push({ name, line1, line2, noradId });
  }
  return out;
}

/**
 * Build a live-tracked satellite — dot + glow + fading orbit trail. The
 * group goes under your inertial-frame root (NOT under the rotating Earth
 * frame). Call `tick(simTime: Date)` each frame to update.
 */
export function createLiveSatellite({ record, color }) {
  let satrec;
  try {
    satrec = satellite.twoline2satrec(record.line1, record.line2);
  } catch (e) {
    console.warn(`[live-sat] TLE parse failed for ${record.name}:`, e);
    return null;
  }

  const baseColor = new THREE.Color(color);
  const hotColor  = new THREE.Color(0xffffff);

  const group = new THREE.Group();

  const dotMat = new THREE.MeshBasicMaterial({ color: baseColor.clone() });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), dotMat);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  dot.add(glow);
  group.add(dot);

  // Trail — pre-allocated dynamic vertex buffer, grows up to TRAIL_LEN points.
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailGeo = new THREE.BufferGeometry();
  const trailAttr = new THREE.BufferAttribute(trailPositions, 3);
  trailAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailAttr);
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({
    color: baseColor.clone(),
    transparent: true,
    opacity: 0.4,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  group.add(trail);

  const trail3d = []; // [[x,y,z], ...] in order, oldest → newest
  let lastTrailMs = -Infinity;

  function tick(simTime) {
    let propagated;
    try { propagated = satellite.propagate(satrec, simTime); } catch { propagated = null; }
    if (!propagated || !propagated.position) {
      dot.visible = false;
      return null;
    }
    // ECI/TEME (km) → scene units. See spec for axis-swap derivation.
    const sx =  propagated.position.x / R_EARTH_KM;
    const sy =  propagated.position.z / R_EARTH_KM;
    const sz = -propagated.position.y / R_EARTH_KM;
    dot.position.set(sx, sy, sz);
    dot.visible = true;

    const t = simTime.getTime();
    if (t - lastTrailMs >= TRAIL_INTERVAL_MS) {
      lastTrailMs = t;
      trail3d.push([sx, sy, sz]);
      if (trail3d.length > TRAIL_LEN) trail3d.shift();
      for (let i = 0; i < trail3d.length; i++) {
        const p = trail3d[i];
        trailPositions[i * 3 + 0] = p[0];
        trailPositions[i * 3 + 1] = p[1];
        trailPositions[i * 3 + 2] = p[2];
      }
      trailGeo.setDrawRange(0, trail3d.length);
      trailAttr.needsUpdate = true;
    }

    return dot.position;
  }

  function setHighlighted(on) {
    dotMat.color.copy(on ? hotColor : baseColor);
    dot.scale.setScalar(on ? 1.6 : 1);
  }

  function clearTrail() {
    trail3d.length = 0;
    lastTrailMs = -Infinity;
    trailGeo.setDrawRange(0, 0);
  }

  function dispose() {
    dot.geometry.dispose();
    dotMat.dispose();
    glow.geometry.dispose();
    glow.material.dispose();
    trailGeo.dispose();
    trailMat.dispose();
  }

  return { group, dot, tick, setHighlighted, clearTrail, dispose };
}

// Greenwich Mean Sidereal Time (radians) at the given Date. Used to rotate
// the Earth frame so live satellites pass over the correct geography.
export function gmstRad(date) {
  return satellite.gstime(date);
}
