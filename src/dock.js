// macOS-style dock that drives a slide-up glass sheet.
//
// Declarative: it scans the sheet for `[data-dock-panel]` sections and builds
// one tile per panel from that panel's `data-dock-icon` (emoji) and
// `data-dock-label`. The panels themselves (the existing forms + lists) own
// their markup and IDs, so page logic that queries those IDs is unaffected.
//
// Behavior: start closed; clicking a tile opens the sheet with that panel
// (tile becomes active + lifted); clicking the active tile, pressing Esc, or
// clicking outside the dock/sheet closes it; clicking another tile swaps the
// visible panel. Hover magnify is pure CSS.
//
// @param dockEl  empty container the tiles are appended to
// @param sheetEl the glass sheet wrapping the `[data-dock-panel]` sections
// @returns { open, close, toggle, activeIndex }
export function createDock({ dockEl, sheetEl }) {
  const panels = [...sheetEl.querySelectorAll('[data-dock-panel]')];
  let activeIndex = -1;

  const tiles = panels.map((panel, i) => {
    const icon = panel.getAttribute('data-dock-icon') || '•';
    const label = panel.getAttribute('data-dock-label') || `Panel ${i + 1}`;

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'dock-tile';
    tile.title = label;
    tile.setAttribute('aria-label', label);
    tile.innerHTML =
      `<span class="dock-emoji" aria-hidden="true">${icon}</span>` +
      `<span class="dock-dot" aria-hidden="true"></span>`;
    tile.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle(i);
    });
    dockEl.appendChild(tile);
    return tile;
  });

  function open(i) {
    panels.forEach((p, idx) => p.classList.toggle('panel-active', idx === i));
    tiles.forEach((t, idx) => t.classList.toggle('active', idx === i));
    sheetEl.classList.add('open');
    activeIndex = i;
  }

  function close() {
    sheetEl.classList.remove('open');
    tiles.forEach((t) => t.classList.remove('active'));
    activeIndex = -1;
  }

  function toggle(i) {
    if (activeIndex === i) close();
    else open(i);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeIndex !== -1) close();
  });
  document.addEventListener('click', (e) => {
    if (activeIndex === -1) return;
    if (dockEl.contains(e.target) || sheetEl.contains(e.target)) return;
    close();
  });

  return {
    open,
    close,
    toggle,
    get activeIndex() { return activeIndex; },
  };
}
