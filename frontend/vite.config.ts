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
        // ProductTruth muss immer frisch vom Backend kommen.
        navigateFallbackDenylist: [/^\/api\//],
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
