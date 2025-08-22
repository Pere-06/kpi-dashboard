// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function devGoogleCsvProxy() {
  return {
    name: 'dev-google-csv-proxy',
    configureServer(server) {
      // Atiende cualquier petición que empiece por /gs/
      server.middlewares.use('/gs/', async (req, res) => {
        try {
          const url = 'https://docs.google.com' + req.url.replace(/^\/gs/, '')
          const r = await fetch(url, { redirect: 'follow' }) // sigue 30x en el servidor
          if (!r.ok) {
            res.statusCode = r.status
            res.end(`Upstream ${r.status}`)
            return
          }
          const text = await r.text()
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/csv; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(text)
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devGoogleCsvProxy()],
})
