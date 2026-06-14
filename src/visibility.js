import * as THREE from 'three';
import { pointInsideCone } from './satellite.js';

// Reused scratch vector — visibility runs every frame, so we avoid allocating.
const _wp = new THREE.Vector3();

/**
 * The "which satellites are visible from which ground stations" hit-test,
 * shared by every page and target type (synthetic orbits, live TLE sats).
 *
 * @param coneStates Array<{ apex, axis, cosHalfAngle, setActive(on) }>
 *        — one per view cone, in world space. (See groundPoints.getConeStates.)
 * @param targets Array<{
 *          getWorldPosition(outVec3),   // writes the target's world position
 *          setHighlighted(on),          // brighten when inside any cone
 *          isVisible?(): boolean,       // optional; skip when false (e.g. live
 *                                       // sat whose propagation produced nothing)
 *        }>
 *
 * Side effects only: brightens cones that currently contain a target and
 * highlights targets that are inside any cone.
 */
export function updateVisibility(coneStates, targets) {
  for (const c of coneStates) c.setActive(false);

  for (const t of targets) {
    if (t.isVisible && !t.isVisible()) continue;
    t.getWorldPosition(_wp);
    let insideAny = false;
    for (const c of coneStates) {
      if (pointInsideCone(_wp, c.apex, c.axis, c.cosHalfAngle)) {
        c.setActive(true);
        insideAny = true;
      }
    }
    t.setHighlighted(insideAny);
  }
}
