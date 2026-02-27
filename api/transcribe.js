const GOOGLE_API_URL = 'https://speech.googleapis.com/v1/speech:recognize'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY não configurada' })
  }

  const { audio, mimeType, sampleRate } = req.body
  if (!audio) {
    return res.status(400).json({ error: 'Nenhum áudio enviado' })
  }

  const encoding = mimeType?.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS'

  try {
    const config = {
      encoding,
      languageCode: 'pt-BR',
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    }
    if (sampleRate) config.sampleRateHertz = sampleRate

    const response = await fetch(`${GOOGLE_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        audio: { content: audio },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Google API error:', data)
      return res.status(502).json({ error: 'Erro na transcrição', google: data })
    }

    const transcript = (data.results || [])
      .map(r => r.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim()

    return res.status(200).json({ transcript })
  } catch (err) {
    console.error('Transcribe error:', err)
    return res.status(500).json({ error: 'Erro interno ao transcrever' })
  }
}
