// Small DOM + math helpers shared by the panel UIs on both pages. Kept
// dependency-free so any module can use them without pulling in Three.js.

/** A colored square chip for a list row. `colorInt` is a 0xRRGGBB number. */
export function makeSwatch(colorInt) {
  const span = document.createElement('span');
  span.className = 'swatch';
  span.style.background = `#${colorInt.toString(16).padStart(6, '0')}`;
  return span;
}

/** A "Remove" button wired to `onClick`. */
export function makeRemoveButton(onClick) {
  const btn = document.createElement('button');
  btn.className = 'remove';
  btn.textContent = 'Remove';
  btn.addEventListener('click', onClick);
  return btn;
}

/** Clamp `v` into [lo, hi]. */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Wrap a longitude into [-180, 180). */
export function wrapLon(v) {
  return ((v + 180) % 360 + 360) % 360 - 180;
}
