import * as THREE from 'three';

// Render a distant celestial body (e.g. Earth seen from the Moon) either as a
// fixed-distance direction marker or at true scale/distance. Position comes from
// an ephemeris function in the central-body ECI frame (km); we apply the same
// ECI→scene swap the satellites use: scene = (x, z, −y) / sceneScaleKm.
//
// @param parent        inertial THREE.Object3D to add the body to
// @param positionAtKm  (simSec) -> [x,y,z] km, body position rel. central body
// @param sceneScaleKm  central body's radius in km (1 scene unit)
// @param realRadiusKm  the rendered body's radius in km (for to-scale mode)
// @param texturePath   optional surface texture
export function createBodyMarker({
  parent, positionAtKm, sceneScaleKm, realRadiusKm,
  texturePath, color = 0x88aaff, markerDistance = 6, markerRadius = 0.35,
}) {
  const geo = new THREE.SphereGeometry(1, 32, 24); // unit sphere; scaled per frame
  let mat;
  if (texturePath) {
    const tex = new THREE.TextureLoader().load(texturePath);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 8 });
  } else {
    mat = new THREE.MeshPhongMaterial({ color });
  }
  const mesh = new THREE.Mesh(geo, mat);
  parent.add(mesh);

  const realRadiusUnits = realRadiusKm / sceneScaleKm;
  const _v = new THREE.Vector3();

  function update(simSec, toScale) {
    const p = positionAtKm(simSec);
    _v.set(p[0], p[2], -p[1]).multiplyScalar(1 / sceneScaleKm); // ECI km → scene
    if (toScale) {
      mesh.position.copy(_v);
      mesh.scale.setScalar(realRadiusUnits);
    } else {
      _v.normalize().multiplyScalar(markerDistance);
      mesh.position.copy(_v);
      mesh.scale.setScalar(markerRadius);
    }
  }

  function dispose() {
    geo.dispose();
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }

  return { mesh, update, dispose };
}
