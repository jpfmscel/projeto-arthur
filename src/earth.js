import * as THREE from 'three';

export const EARTH_RADIUS = 1;
export const ATMOSPHERE_RADIUS = 1.05;
const CLOUD_RADIUS = 1.012;

// Texture filenames live under /public/textures/. They're served at
// import.meta.env.BASE_URL + 'textures/...' so the same code works both
// locally (BASE_URL='/') and under a sub-path on GitHub Pages.
const B = import.meta.env.BASE_URL;
const TEX = {
  day:      `${B}textures/earth_day.jpg`,
  specular: `${B}textures/earth_specular.jpg`,
  normal:   `${B}textures/earth_normal.jpg`,
  clouds:   `${B}textures/earth_clouds.png`,
};

export function createEarth() {
  const loader = new THREE.TextureLoader();

  // Surface textures map equirectangular (lon, lat). Default sRGB for the
  // color map so it lights correctly; the normal & specular maps stay linear.
  const dayMap      = loader.load(TEX.day);
  const specularMap = loader.load(TEX.specular);
  const normalMap   = loader.load(TEX.normal);
  const cloudMap    = loader.load(TEX.clouds);

  dayMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();

  // ----- planet body -----
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: dayMap,
    specularMap: specularMap,   // oceans reflect, land stays matte
    specular: new THREE.Color(0x6688aa),
    shininess: 24,
    normalMap: normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  group.add(earthMesh);

  // ----- clouds layer (slightly larger sphere, slow independent rotation) -----
  const cloudGeo = new THREE.SphereGeometry(CLOUD_RADIUS, 96, 64);
  const cloudMat = new THREE.MeshPhongMaterial({
    map: cloudMap,
    alphaMap: cloudMap,         // grayscale cloud texture → alpha mask
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  group.add(clouds);

  // ----- translucent atmosphere shell -----
  const atmoGeo = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 48);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x6ec1ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(atmoGeo, atmoMat));

  // Expose pieces so the render loop can spin them independently.
  group.userData = { earthMesh, clouds };

  return group;
}
