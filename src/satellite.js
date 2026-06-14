import * as THREE from 'three';

/**
 * Render a two-body orbit (from orbit.js) as a THREE group: the orbit ellipse
 * plus a moving dot + glow. Positions come from the orbit in ECI km and are
 * converted to scene units here — the body is 1 unit, so scene = ECI / radiusKm,
 * with the same axis swap the live satellites use (sx=x, sy=z, sz=-y) so every
 * satellite shares one inertial frame.
 *
 * @param orbit     an object from orbit.js (positionEciKm / ellipseEciKm)
 * @param color     0xRRGGBB
 * @param radiusKm  the central body's radius in km (scene scale)
 * @param epochSec  sim-time seconds at creation; propagation is epoch-relative
 *
 * tick(simSec) moves the dot to the current sim time; reset(simSec) re-bases the
 * epoch so the orbit snaps back to its defining anomaly.
 */
export function createSatellite({ orbit, color = 0xffffff, radiusKm, epochSec = 0 }) {
  const baseColor = new THREE.Color(color);
  const hotColor = new THREE.Color(0xffffff);
  const group = new THREE.Group();
  let epoch = epochSec;

  // ECI km -> scene units.
  const toScene = (p) => [p[0] / radiusKm, p[2] / radiusKm, -p[1] / radiusKm];

  // ----- orbit ellipse -----
  const ringPts = orbit.ellipseEciKm(192).map((p) => {
    const s = toScene(p);
    return new THREE.Vector3(s[0], s[1], s[2]);
  });
  if (ringPts.length) ringPts.push(ringPts[0].clone()); // close the loop
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
  );
  group.add(ring);

  // ----- satellite dot + glow -----
  const satMat = new THREE.MeshBasicMaterial({ color: baseColor.clone() });
  const satMesh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), satMat);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({ color: baseColor.clone(), transparent: true, opacity: 0.18, depthWrite: false }),
  );
  satMesh.add(glow);
  group.add(satMesh);

  const worldPos = new THREE.Vector3();

  function setAt(elapsedSec) {
    const s = toScene(orbit.positionEciKm(elapsedSec));
    satMesh.position.set(s[0], s[1], s[2]);
  }
  setAt(0);

  function tick(simSec) {
    setAt(simSec - epoch);
    satMesh.getWorldPosition(worldPos);
    return worldPos;
  }

  function reset(simSec) {
    epoch = simSec;
    setAt(0);
  }

  function setHighlighted(on) {
    satMat.color.copy(on ? hotColor : baseColor);
    satMesh.scale.setScalar(on ? 1.6 : 1);
  }

  function dispose() {
    ring.geometry.dispose();
    ring.material.dispose();
    satMesh.geometry.dispose();
    satMesh.material.dispose();
    glow.geometry.dispose();
    glow.material.dispose();
  }

  return { group, satMesh, tick, reset, setHighlighted, dispose };
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
