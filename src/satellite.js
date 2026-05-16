import * as THREE from 'three';
import { EARTH_RADIUS } from './earth.js';

/**
 * Build a simple circular-orbit satellite.
 *
 * Trajectory params:
 *   - altitude       (scene units, where Earth radius = 1)
 *   - inclinationDeg (tilt of the orbital plane from the equator)
 *   - raanDeg        (longitude of the ascending node)
 *
 * Motion params:
 *   - omegaDegPerSec  angular velocity along the orbit
 *   - alphaDegPerSec2 angular acceleration along the orbit (constant)
 *
 * Returns an object with:
 *   - group     THREE.Group placed in the world (already tilted into the orbital plane)
 *   - satMesh   the satellite dot (its local position is updated by tick(dt))
 *   - tick(dt)  advances the satellite by dt seconds, returns its world position
 *   - setHighlighted(bool)  visual highlight when inside any view cone
 */
export function createSatellite({
  altitude = 0.15,
  inclinationDeg = 51.6,
  raanDeg = 0,
  omegaDegPerSec = 30,
  alphaDegPerSec2 = 0,
  color = 0xffffff,
}) {
  const r = EARTH_RADIUS + altitude;
  const baseColor = new THREE.Color(color);
  const hotColor  = new THREE.Color(0xffffff);

  const group = new THREE.Group();

  // ----- orbit ring (circle in the local XZ plane, radius r) -----
  const segments = 192;
  const ringPts = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(r * Math.cos(t), 0, r * Math.sin(t)));
  }
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
  );
  group.add(ring);

  // ----- satellite dot -----
  const satGeo = new THREE.SphereGeometry(0.018, 16, 12);
  const satMat = new THREE.MeshBasicMaterial({ color: baseColor.clone() });
  const satMesh = new THREE.Mesh(satGeo, satMat);
  // Tiny "glow" sphere so it reads against the starfield even when small on screen.
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  satMesh.add(glow);
  group.add(satMesh);

  // Apply orbital-plane transform:
  //   1. tilt around X (inclination) — raises +Z side of the orbit toward +Y
  //   2. rotate around Y (RAAN) — moves the ascending node around the equator
  // Three's default Euler order 'XYZ' applies X first, then Y. Perfect.
  group.rotation.set(
    THREE.MathUtils.degToRad(inclinationDeg),
    THREE.MathUtils.degToRad(raanDeg),
    0,
  );

  // ----- motion state -----
  const omega = THREE.MathUtils.degToRad(omegaDegPerSec);
  const alpha = THREE.MathUtils.degToRad(alphaDegPerSec2);
  let t = 0;
  const phase0 = 0;

  const worldPos = new THREE.Vector3();

  function tick(dt) {
    t += dt;
    const theta = phase0 + omega * t + 0.5 * alpha * t * t;
    satMesh.position.set(r * Math.cos(theta), 0, r * Math.sin(theta));
    satMesh.getWorldPosition(worldPos);
    return worldPos;
  }

  function setHighlighted(on) {
    satMat.color.copy(on ? hotColor : baseColor);
    satMesh.scale.setScalar(on ? 1.6 : 1);
  }

  function reset() {
    t = 0;
    satMesh.position.set(r, 0, 0);
  }

  function dispose() {
    ring.geometry.dispose();
    ring.material.dispose();
    satMesh.geometry.dispose();
    satMesh.material.dispose();
    glow.geometry.dispose();
    glow.material.dispose();
  }

  return { group, satMesh, tick, setHighlighted, reset, dispose };
}

/**
 * Returns true iff `point` (world space) lies inside the cone defined by
 * apex (world), unit axis direction (world), and half-angle whose cosine
 * is `cosHalfAngle`. Used for the "satellite visible from ground station" check.
 */
export function pointInsideCone(point, apex, axis, cosHalfAngle) {
  const dx = point.x - apex.x;
  const dy = point.y - apex.y;
  const dz = point.z - apex.z;
  const along = dx * axis.x + dy * axis.y + dz * axis.z;
  if (along <= 0) return false;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist === 0) return false;
  return along / dist >= cosHalfAngle;
}
