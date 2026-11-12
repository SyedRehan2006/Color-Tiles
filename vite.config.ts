import { defineConfig } from 'vite'

// Two pages: index.html is the main menu, game.html is the game.
// Normal build: GitHub Pages serves the site from /<repo-name>/, so asset URLs need that prefix.
// Poki build (`npm run build:poki`, mode "poki"): relative URLs, output in dist-poki/ (zip its contents for Poki).
export default defineConfig(({ mode }) => ({
  base: mode === 'poki' ? './' : '/Color-Tiles/',
  build: {
    outDir: mode === 'poki' ? 'dist-poki' : 'dist',
    rollupOptions: {
      input: { main: 'index.html', game: 'game.html' },
    },
  },
}))
