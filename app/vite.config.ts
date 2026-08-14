import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildStamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base: process.env.BASE_PATH || '/Habla-ingles/',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Chunk 职场英语',
        short_name: 'Chunk',
        description: '职场英语碎片训练:背块不背词',
        lang: 'zh-CN',
        display: 'standalone',
        background_color: '#fff5f8',
        theme_color: '#ffb0cd',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}']
      }
    })
  ]
})
