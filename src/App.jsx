import { useState, useEffect, useCallback, useRef } from 'react'

const MAX_DURATION = 60_000 // 60s, limite da API síncrona

function App() {
  const [micAllowed, setMicAllowed] = useState(false)
  const [listening, setListening] = useState(false)
  const [checking, setChecking] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const timerRef = useRef(null)

  useEffect(() => {
    navigator.permissions.query({ name: 'microphone' }).then((result) => {
      setMicAllowed(result.state === 'granted')
      setChecking(false)

      result.addEventListener('change', () => {
        setMicAllowed(result.state === 'granted')
      })
    }).catch(() => {
      setChecking(false)
    })
  }, [])

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setMicAllowed(true)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }, [])

  const sendAudio = useCallback(async (blob) => {
    setProcessing(true)
    setError('')

    try {
      const reader = new FileReader()
      const base64 = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64 }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao transcrever')
        return
      }

      if (data.transcript) {
        setTranscript(prev => {
          if (!prev) return data.transcript
          return prev + '\n\n' + data.transcript
        })
      } else {
        setError('Nenhuma fala detectada. Tente novamente.')
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setProcessing(false)
    }
  }, [])

  const startRecording = useCallback(async () => {
    setError('')
    audioChunks.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunks.current, { type: 'audio/webm;codecs=opus' })
        sendAudio(blob)
      }

      recorder.start()
      mediaRecorder.current = recorder
      setListening(true)

      timerRef.current = setTimeout(() => {
        if (mediaRecorder.current?.state === 'recording') {
          mediaRecorder.current.stop()
          setListening(false)
        }
      }, MAX_DURATION)
    } catch {
      setError('Não foi possível iniciar a gravação.')
    }
  }, [sendAudio])

  const stopRecording = useCallback(() => {
    clearTimeout(timerRef.current)
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setListening(false)
  }, [])

  const toggleRecording = useCallback(() => {
    if (listening) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [listening, startRecording, stopRecording])

  if (checking) return null

  return (
    <div className="container">
      {!micAllowed ? (
        <button className="enable-btn" onClick={requestMic}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.08 1.32-.22 1.94" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Permitir microfone
        </button>
      ) : (
        <>
          <button
            className={`mic-btn ${listening ? 'active' : ''}`}
            onClick={toggleRecording}
            disabled={processing}
          >
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="11" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          <span className="status">
            {processing ? 'Transcrevendo...' : listening ? 'Ouvindo...' : 'Toque para gravar'}
          </span>

          {error && <p className="error">{error}</p>}

          {transcript && (
            <div className="transcript">
              {transcript.split('\n\n').map((block, i) => (
                <p key={i}>{block}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
