import crypto from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SPEECH_V2_URL = 'https://us-speech.googleapis.com/v2'

let cachedToken = null
let tokenExpiry = 0

async function getAccessToken(sa) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(sa.private_key, 'base64url')

  const jwt = `${header}.${claims}.${signature}`

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const data = await tokenRes.json()
  if (!data.access_token) {
    throw new Error('Falha ao obter token: ' + JSON.stringify(data))
  }

  cachedToken = data.access_token
  tokenExpiry = Date.now() + 3500_000
  return cachedToken
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!saJson) {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT não configurada' })
  }

  let sa
  try {
    sa = JSON.parse(saJson)
  } catch {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT JSON inválido' })
  }

  const { audio } = req.body
  if (!audio) {
    return res.status(400).json({ error: 'Nenhum áudio enviado' })
  }

  try {
    const token = await getAccessToken(sa)
    const url = `${SPEECH_V2_URL}/projects/${sa.project_id}/locations/us/recognizers/_:recognize`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        config: {
          auto_decoding_config: {},
          language_codes: ['pt-BR', 'en-US'],
          model: 'chirp_3',
          features: {
            enable_automatic_punctuation: true,
          },
        },
        content: audio,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Google V2 API error:', data)
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
