import { createDock } from './dock.js';

// Wire the shared glass "chrome" that sits on top of the 3D scene on both
// pages: the dock + slide-up sheet, and the corner help popover. Page entries
// (main.js / moonMain.js) call this once; the actual object-management logic
// lives in those entries and is untouched by the chrome.
export function initPageChrome() {
  createDock({
    dockEl: document.getElementById('dock'),
    sheetEl: document.getElementById('dock-sheet'),
  });

  const fab = document.getElementById('help-fab');
  const pop = document.getElementById('help-popover');
  if (fab && pop) {
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !pop.contains(e.target) && e.target !== fab) pop.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') pop.hidden = true;
    });
  }
}
