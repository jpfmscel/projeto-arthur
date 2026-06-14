import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `base: './'` produces relative asset paths so the same build works whether
// the site is served at the domain root (user/org Pages) or under a sub-path
// like /repo-name/ (project Pages) — without having to hard-code the repo name.
//
// Two HTML entry points (Earth + Moon) so the production build emits both
// pages. The dev server serves any .html by path, so it needs no config.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        moon: resolve(__dirname, 'moon.html'),
      },
    },
  },
});
