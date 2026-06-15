import * as THREE from 'three';

// Reused scratch vector — visibility runs every frame, so we avoid allocating.
const _wp = new THREE.Vector3();

/**
 * True iff `point` (world) lies inside the cone defined by apex (world), unit
 * axis (world), and the half-angle whose cosine is `cosHalfAngle`.
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

/**
 * The "which satellites are visible from which ground stations" hit-test.
 *
 * @param coneStates  Array<{ apex, axis, cosHalfAngle, setActive(on) }> — reused
 *                    across frames (groundPoints updates them in place).
 * @param targetGroups Array of target arrays. Each target:
 *        { getWorldPosition(out), setHighlighted(on), isVisible?(): boolean }.
 *        Passing groups (synthetic + live) avoids merging into a new array each
 *        frame.
 *
 * Side effects only: brightens cones that currently contain a target and
 * highlights targets inside any cone.
 */
export function updateVisibility(coneStates, targetGroups) {
  for (let c = 0; c < coneStates.length; c++) {
    coneStates[c].setActive(false);
    coneStates[c].count = 0;
  }

  for (let g = 0; g < targetGroups.length; g++) {
    const group = targetGroups[g];
    for (let i = 0; i < group.length; i++) {
      const t = group[i];
      if (t.isVisible && !t.isVisible()) continue;
      t.getWorldPosition(_wp);
      let insideAny = false;
      for (let c = 0; c < coneStates.length; c++) {
        const cs = coneStates[c];
        if (pointInsideCone(_wp, cs.apex, cs.axis, cs.cosHalfAngle)) {
          cs.setActive(true);
          cs.count++;
          insideAny = true;
        }
      }
      t.setHighlighted(insideAny);
    }
  }
}
