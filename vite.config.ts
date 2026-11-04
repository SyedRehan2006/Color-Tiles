import { defineConfig } from 'vite'

// GitHub Pages serves the site from /<repo-name>/, so built asset URLs need that prefix.
export default defineConfig({
  base: '/car-color-tiles/',
})
