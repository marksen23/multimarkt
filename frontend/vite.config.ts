import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Personal Resale OS',
        short_name: 'Resale OS',
        description: 'Fotografieren statt Formulare ausfüllen.',
        theme_color: '#059669',
        background_color: '#f7f7f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'de',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // API-Aufrufe niemals aus dem Service-Worker-Cache beantworten —
        // ProductTruth muss immer frisch vom Backend kommen. /healthz
        // ebenfalls ausschließen (September 2026, echter Deploy-Bug: ohne
        // das lieferte der Service Worker dort die gecachte SPA-Shell
        // statt die Anfrage an den Server durchzulassen — Render selbst
        // ist davon nicht betroffen, das ist reiner Server-seitiger
        // Health-Check, aber ein Browser-Aufruf zum Debuggen lief ins Leere).
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz$/],
        // Ohne diese beiden: ein neuer Service Worker wartet, bis ALLE
        // offenen Tabs der alten Version geschlossen sind, bevor er die
        // Kontrolle übernimmt — `registerType: 'autoUpdate'` allein reicht
        // nicht, um das zuverlässig schnell zu machen (genau das hat beim
        // letzten Deploy zu einer sichtbar veralteten, gecachten Version
        // geführt, obwohl der Server längst den neuen Stand ausgeliefert
        // hat). Mit `skipWaiting`/`clientsClaim` übernimmt ein neuer
        // Service Worker sofort beim nächsten Laden.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
