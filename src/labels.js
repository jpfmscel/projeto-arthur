import * as THREE from 'three';

// HTML overlay of name labels that track scene elements and expand on hover.
//
// Each target: { getWorldPosition(out) -> Vector3, name, details() -> htmlString }.
// `groups` is an array of stable target arrays (ground points, synthetic sats,
// live sats). Per frame we project every target, show the nearest `maxLabels`
// (decluttered), and ride each element by repositioning its pill. One stable
// pill <div> per target keeps hover identity stable across frames.

export function createLabelOverlay({ container, camera, canvas, groups, maxLabels = 40, tooltipTtlMs = 3500 }) {
  const pills = new Map();   // target -> { el, nameEl, detailsEl, hovered, timer }
  const _p = new THREE.Vector3();
  const seen = new Set();

  function makePill(target) {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = '<span class="lbl-name"></span><div class="lbl-details"></div>';
    const nameEl = el.querySelector('.lbl-name');
    const detailsEl = el.querySelector('.lbl-details');
    nameEl.textContent = target.name;
    const rec = { el, nameEl, detailsEl, hovered: false, timer: 0 };
    el.addEventListener('mouseenter', () => {
      rec.hovered = true;
      detailsEl.innerHTML = target.details();
      el.classList.add('expanded');
      // TTL: auto-fade the expanded card after a while, even if still hovered.
      clearTimeout(rec.timer);
      rec.timer = setTimeout(() => el.classList.remove('expanded'), tooltipTtlMs);
    });
    el.addEventListener('mouseleave', () => {
      rec.hovered = false;
      clearTimeout(rec.timer);
      el.classList.remove('expanded');
    });
    container.appendChild(el);
    pills.set(target, rec);
    return rec;
  }

  function update() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Collect on-screen candidates with camera distance.
    const candidates = [];
    seen.clear();
    for (const group of groups) {
      for (const target of group) {
        seen.add(target);
        target.getWorldPosition(_p);
        const dist = _p.distanceTo(camera.position);
        _p.project(camera);
        if (_p.z > 1 || _p.x < -1.1 || _p.x > 1.1 || _p.y < -1.1 || _p.y > 1.1) {
          const rec = pills.get(target);
          if (rec && !rec.hovered) rec.el.style.display = 'none';
          continue;
        }
        candidates.push({ target, dist, x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h });
      }
    }

    // Drop pills whose target disappeared.
    for (const [target, rec] of pills) {
      if (!seen.has(target)) { rec.el.remove(); pills.delete(target); }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const show = i < maxLabels;
      let rec = pills.get(c.target);
      if (!show) {
        if (rec && !rec.hovered) rec.el.style.display = 'none';
        if (!rec || !rec.hovered) continue;
      }
      if (!rec) rec = makePill(c.target);
      rec.el.style.display = 'block';
      rec.el.style.left = `${c.x}px`;
      rec.el.style.top = `${c.y}px`;
    }
  }

  function dispose() {
    for (const [, rec] of pills) rec.el.remove();
    pills.clear();
  }

  return { update, dispose };
}
