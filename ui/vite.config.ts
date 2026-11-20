import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

// Browser requests stay same-origin in development and Vite proxies them to
// the local Fuseki instance (`devbox run fuseki:dev`). This avoids needing
// CORS on Fuseki and keeps the development endpoint relative.
const fusekiDev = `http://127.0.0.1:${process.env.FUSEKI_DEV_PORT ?? '3031'}`

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    proxy: {
      '/catalog': {
        target: fusekiDev,
        changeOrigin: true,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
})
