import * as THREE from 'three';
import { EARTH_RADIUS } from './earth.js';

// How far above Earth's surface (in scene units, where Earth radius = 1)
// the rendered cone extends. Visually represents "out into orbital space."
const CONE_HEIGHT = 1.6;

// Lat/lon (degrees) → 3D point on a sphere of given radius.
// Convention: latitude 0 = equator, +Y = north pole.
// Longitude 0 lies on the +X axis. Z is negated so increasing east
// longitude wraps in the same direction as the equirectangular Earth
// texture mapped onto Three's default SphereGeometry (U=0.5 = +X,
// U=0.75 = -Z). Without the negation, markers land on the wrong continent.
export function latLonToVec3(latDeg, lonDeg, radius = EARTH_RADIUS) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const x =  radius * Math.cos(lat) * Math.cos(lon);
  const y =  radius * Math.sin(lat);
  const z = -radius * Math.cos(lat) * Math.sin(lon);
  return new THREE.Vector3(x, y, z);
}

/**
 * Build a group containing a surface marker + a translucent cone whose apex
 * sits on the surface and whose axis points along the local "up". The cone's
 * half-angle equals halfAngleDeg, so a satellite is "visible" iff it lies
 * inside this cone.
 *
 * The returned object exposes:
 *   - group         add this to your scene (typically under the earth frame
 *                   so the cone rotates with the Earth)
 *   - cone          the cone mesh — use cone.getWorldPosition() for the apex
 *                   and cone's world quaternion to derive the axis each frame
 *   - cosHalfAngle  cached cos(halfAngle), used by the hit test
 *   - setActive(on) brighten the cone when something's currently inside it
 */
export function createViewCone({ lat, lon, halfAngleDeg, color }) {
  const group = new THREE.Group();
  group.userData = { lat, lon, halfAngleDeg };

  const surfacePoint = latLonToVec3(lat, lon, EARTH_RADIUS);
  const normal = surfacePoint.clone().normalize();

  // Marker dot at the surface
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  marker.position.copy(surfacePoint).addScaledVector(normal, 0.005);
  group.add(marker);

  // Outline-only cone: a base circle at the cone's opening plus a handful of
  // spokes from apex → base, so the cone reads as a shape without filling
  // the screen with translucent volume. Local frame: apex at origin, axis
  // along +Y, base ring sits at +Y * CONE_HEIGHT.
  const halfAngle = THREE.MathUtils.degToRad(halfAngleDeg);
  const baseRadius = Math.tan(halfAngle) * CONE_HEIGHT;

  const baseSegments = 96;
  const basePts = [];
  for (let i = 0; i <= baseSegments; i++) {
    const t = (i / baseSegments) * Math.PI * 2;
    basePts.push(new THREE.Vector3(
      baseRadius * Math.cos(t), CONE_HEIGHT, baseRadius * Math.sin(t),
    ));
  }
  const baseGeo = new THREE.BufferGeometry().setFromPoints(basePts);

  const numSpokes = 6;
  const spokePts = [];
  for (let i = 0; i < numSpokes; i++) {
    const t = (i / numSpokes) * Math.PI * 2;
    spokePts.push(new THREE.Vector3(0, 0, 0));
    spokePts.push(new THREE.Vector3(
      baseRadius * Math.cos(t), CONE_HEIGHT, baseRadius * Math.sin(t),
    ));
  }
  const spokeGeo = new THREE.BufferGeometry().setFromPoints(spokePts);

  const baseLineOpacity = 0.7;
  const spokeLineOpacity = 0.45;
  const lineMatBase = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: baseLineOpacity,
  });
  const lineMatSpoke = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: spokeLineOpacity,
  });

  const baseLine = new THREE.Line(baseGeo, lineMatBase);
  const spokes = new THREE.LineSegments(spokeGeo, lineMatSpoke);

  // Faint volumetric fill (5% opacity) so the cone reads as a 3D volume
  // even when no spokes are facing the camera. Same local frame as the
  // outline: apex at origin, axis along +Y.
  const fillGeo = new THREE.ConeGeometry(baseRadius, CONE_HEIGHT, 48, 1, true);
  fillGeo.translate(0, -CONE_HEIGHT / 2, 0); // apex at origin, base at -Y * h
  fillGeo.rotateX(Math.PI);                  // flip so it extends along +Y
  const fillOpacity = 0.05;
  const fillHotOpacity = 0.15;
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);

  const cone = new THREE.Group();
  cone.add(fill);
  cone.add(baseLine);
  cone.add(spokes);

  // Place apex at the surface point and align local +Y with the surface normal.
  cone.position.copy(surfacePoint);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  group.add(cone);

  function setActive(on) {
    lineMatBase.opacity  = on ? 1.0 : baseLineOpacity;
    lineMatSpoke.opacity = on ? 0.8 : spokeLineOpacity;
    fillMat.opacity      = on ? fillHotOpacity : fillOpacity;
  }

  function dispose() {
    marker.geometry.dispose();
    marker.material.dispose();
    baseGeo.dispose();
    spokeGeo.dispose();
    fillGeo.dispose();
    lineMatBase.dispose();
    lineMatSpoke.dispose();
    fillMat.dispose();
  }

  return {
    group,
    cone,
    cosHalfAngle: Math.cos(halfAngle),
    setActive,
    dispose,
  };
}
