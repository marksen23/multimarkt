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
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Personal Resale OS',
        short_name: 'Resale OS',
        description: 'Fotografieren statt Formulare ausfüllen.',
        theme_color: '#000000',
        background_color: '#f9fafb',
        display: 'standalone',
        start_url: '/',
        // HINWEIS: nur ein SVG-Icon vorhanden. Für vollständige "Add to
        // Home Screen"-Unterstützung (insb. iOS) fehlen noch echte
        // 192x192/512x512-PNG-Icons — ein Asset-/Design-Task, kein Code-Gap.
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
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
