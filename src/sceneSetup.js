import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStarfield } from './stars.js';

/**
 * Build the standard "space scene" scaffold shared by both pages: WebGL
 * renderer, perspective camera, damped OrbitControls, ambient + sun lighting,
 * and a starfield. Owns the resize handling and the render loop.
 *
 * Page-specific scene content (the body, ground points, satellites) is added
 * by the caller to the returned `scene`. The caller drives per-frame sim logic
 * through the `onFrame(dt)` callback passed to `start()` — the loop always
 * updates controls and renders, so the camera stays interactive even when the
 * page's simulation is paused.
 *
 * Defaults reproduce the original Earth-page setup; callers override per body
 * (e.g. the Moon needs no room for GEO-distance orbits).
 *
 * @returns { scene, camera, renderer, controls, start(onFrame) }
 */
export function createScene(canvas, {
  fov = 45,
  near = 0.01,
  far = 1000,
  cameraPosition = [0, 2, 8],
  minDistance = 1.1,
  maxDistance = 40,
  clearColor = 0x05070d,
  ambientIntensity = 0.35,
  sunIntensity = 1.1,
  sunPosition = [5, 3, 4],
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(clearColor, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  camera.position.set(...cameraPosition);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;

  scene.add(new THREE.AmbientLight(0xffffff, ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  sun.position.set(...sunPosition);
  scene.add(sun);

  scene.add(createStarfield());

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function start(onFrame) {
    const clock = new THREE.Clock();
    function tick() {
      const dt = clock.getDelta();
      if (onFrame) onFrame(dt);
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  }

  return { scene, camera, renderer, controls, start };
}
