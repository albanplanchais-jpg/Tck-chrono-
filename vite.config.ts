import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * L'app est servie sur /app (fichier app.html) ; la racine « / » est le site vitrine (dossier landing/).
 * En local (dev / preview) : toute adresse de page (sans extension) sert app.html, comme sur Vercel.
 */
const appFallback = (): Plugin => {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const path = (req.url ?? '/').split('?')[0]
    if (!path.startsWith('/api/') && !path.startsWith('/@') && !path.startsWith('/src/') && !path.startsWith('/node_modules/') && !/\.[a-z0-9]+$/i.test(path))
      req.url = '/app.html' + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
    next()
  }
  return { name: 'app-fallback', configureServer: (s) => { s.middlewares.use(rewrite) }, configurePreviewServer: (s) => { s.middlewares.use(rewrite) } }
}

export default defineConfig({
  build: { rollupOptions: { input: 'app.html' } },
  plugins: [
    appFallback(),
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'TCK Chrono — Torcy Canoë-Kayak',
        short_name: 'TCK Chrono — Torcy Canoë-Kayak',
        description: 'Chronométrage simple pour le coach',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        start_url: '/app',
        scope: '/',
        id: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Hors ligne et pour les comptes déjà installés : toute page ouvre l'app.
        navigateFallback: '/app.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ]
})
