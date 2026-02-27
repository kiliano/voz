import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const GOOGLE_API_URL = 'https://speech.googleapis.com/v1/speech:recognize'

function apiMiddleware() {
  let apiKey

  return {
    name: 'api-middleware',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      apiKey = env.GOOGLE_API_KEY
    },
    configureServer(server) {
      server.middlewares.use('/api/transcribe', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Método não permitido' }))
          return
        }

        if (!apiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'GOOGLE_API_KEY não configurada' }))
          return
        }

        let body = ''
        for await (const chunk of req) body += chunk
        const { audio, mimeType } = JSON.parse(body)

        if (!audio) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Nenhum áudio enviado' }))
          return
        }

        const encoding = mimeType?.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS'

        try {
          const response = await fetch(`${GOOGLE_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: {
                encoding,
                languageCode: 'pt-BR',
                enableAutomaticPunctuation: true,
              },
              audio: { content: audio },
            }),
          })

          const data = await response.json()

          res.setHeader('Content-Type', 'application/json')

          if (!response.ok) {
            console.error('Google API error:', data)
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'Erro na transcrição', google: data }))
            return
          }

          const transcript = (data.results || [])
            .map(r => r.alternatives?.[0]?.transcript || '')
            .join(' ')
            .trim()

          res.end(JSON.stringify({ transcript }))
        } catch (err) {
          console.error('Transcribe error:', err)
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Erro interno ao transcrever' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiMiddleware()],
})
