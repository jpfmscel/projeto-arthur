import { defineConfig } from 'vite';

// `base: './'` produces relative asset paths so the same build works whether
// the site is served at the domain root (user/org Pages) or under a sub-path
// like /repo-name/ (project Pages) — without having to hard-code the repo name.
export default defineConfig({
  base: './',
});
