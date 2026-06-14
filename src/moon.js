import * as THREE from 'three';
import { BODY_RADIUS } from './units.js';

// The Moon is normalized to radius 1 like the Earth (1 unit ≡ R_Moon ≈
// 1737.4 km). Unlike Earth there is no atmosphere and no cloud layer — just
// the regolith surface.
export const MOON_RADIUS = BODY_RADIUS;

// Albedo map served at import.meta.env.BASE_URL + 'textures/...' so the same
// build works locally and under a GitHub Pages sub-path. Source: Solar System
// Scope (CC BY 4.0), derived from NASA/USGS lunar imagery.
const B = import.meta.env.BASE_URL;
const TEX = { albedo: `${B}textures/moon.jpg` };

export function createMoon() {
  const loader = new THREE.TextureLoader();

  const albedo = loader.load(TEX.albedo);
  albedo.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.SphereGeometry(MOON_RADIUS, 96, 64);
  const mat = new THREE.MeshPhongMaterial({
    map: albedo,
    // Reuse the albedo's luminance as a cheap bump map for subtle crater
    // relief — no extra asset. Kept small so the surface doesn't read noisy.
    bumpMap: albedo,
    bumpScale: 0.015,
    // The Moon is matte: a near-black, low-shininess specular avoids the
    // plastic highlight a default Phong material would give.
    specular: new THREE.Color(0x222222),
    shininess: 4,
  });

  return new THREE.Mesh(geo, mat);
}
