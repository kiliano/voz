import { useState, useEffect, useCallback, useRef } from 'react'

const MAX_DURATION = 55_000

function App() {
  const [micAllowed, setMicAllowed] = useState(false)
  const [listening, setListening] = useState(false)
  const [checking, setChecking] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('fala_messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [copiedId, setCopiedId] = useState(null)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [floatingHearts, setFloatingHearts] = useState([])

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const timerRef = useRef(null)
  const intervalRef = useRef(null)
  const analyserRef = useRef(null)
  const audioCtxRef = useRef(null)
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const chatEndRef = useRef(null)
  const cancelledRef = useRef(false)
  const initialScrollRef = useRef(true)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!navigator.permissions || !navigator.permissions.query) {
      setChecking(false)
      return
    }
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

  useEffect(() => {
    const scroll = () => {
      if (chatEndRef.current) {
        const behavior = initialScrollRef.current ? 'instant' : 'smooth'
        chatEndRef.current.scrollIntoView({ behavior })
        initialScrollRef.current = false
      }
    }
    if (initialScrollRef.current) {
      setTimeout(scroll, 100)
    } else {
      scroll()
    }
    try {
      const trimmed = messages.slice(-50)
      localStorage.setItem('fala_messages', JSON.stringify(trimmed))
    } catch { /* storage full */ }
  }, [messages, micAllowed])

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setMicAllowed(true)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }, [])

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      ctx.clearRect(0, 0, w, h)

      ctx.lineWidth = 2
      ctx.strokeStyle = '#dc2626'
      ctx.beginPath()

      const sliceWidth = w / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * h) / 2
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          const prevV = dataArray[i - 1] / 128.0
          const prevY = (prevV * h) / 2
          const cpx = x - sliceWidth / 2
          ctx.quadraticCurveTo(cpx, prevY, x, y)
        }
        x += sliceWidth
      }

      ctx.stroke()
    }

    draw()
  }, [])

  useEffect(() => {
    if (listening && analyserRef.current) {
      drawWaveform()
    }
  }, [listening, drawWaveform])

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  const sendAudio = useCallback(async (blob) => {
    setProcessing(true)
    setError('')

    try {
      const reader = new FileReader()
      const base64 = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const maxRetries = 3
      let lastError = null

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mimeType: blob.type, sampleRate: blob._sampleRate }),
          })

          const data = await res.json()

          if (!res.ok) {
            lastError = `Erro ${res.status}:\n${JSON.stringify(data, null, 2)}`
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 1500 * attempt))
              continue
            }
            setMessages(prev => [...prev, { id: Date.now(), text: `⚠ ${lastError}\n(${maxRetries} tentativas)` }])
            return
          }

          if (data.transcript) {
            setMessages(prev => [...prev, { id: Date.now(), text: data.transcript }])
          } else {
            setMessages(prev => [...prev, { id: Date.now(), text: `⚠ Nenhuma fala detectada.\n${JSON.stringify(data, null, 2)}` }])
          }
          return
        } catch (err) {
          lastError = `Erro de conexão:\n${err.message}`
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * attempt))
            continue
          }
          setMessages(prev => [...prev, { id: Date.now(), text: `⚠ ${lastError}\n(${maxRetries} tentativas)` }])
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), text: `⚠ Erro ao processar áudio:\n${err.message}` }])
    } finally {
      setProcessing(false)
    }
  }, [])

  const startRecording = useCallback(async () => {
    setError('')
    setElapsed(0)
    audioChunks.current = []
    cancelledRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // analyser pra waveform
      if (audioCtxRef.current) audioCtxRef.current.close()
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.85
      source.connect(analyser)
      analyserRef.current = analyser

      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm;codecs=opus'
      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      const recSampleRate = audioCtx.sampleRate

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        stopWaveform()
        if (audioCtxRef.current) {
          audioCtxRef.current.close()
          audioCtxRef.current = null
        }
        if (!cancelledRef.current) {
          const blob = new Blob(audioChunks.current, { type: recorder.mimeType })
          blob._sampleRate = recSampleRate
          sendAudio(blob)
        }
      }

      recorder.start()
      mediaRecorder.current = recorder
      setListening(true)

      // timer visual
      const startTime = Date.now()
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime)
      }, 100)

      // auto-stop em 55s
      timerRef.current = setTimeout(() => {
        if (mediaRecorder.current?.state === 'recording') {
          mediaRecorder.current.stop()
          setListening(false)
          clearInterval(intervalRef.current)
        }
      }, MAX_DURATION)
    } catch {
      setError('Não foi possível iniciar a gravação.')
    }
  }, [sendAudio, stopWaveform])

  const stopRecording = useCallback(() => {
    clearTimeout(timerRef.current)
    clearInterval(intervalRef.current)
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setListening(false)
  }, [])

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true
    clearTimeout(timerRef.current)
    clearInterval(intervalRef.current)
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setListening(false)
    setElapsed(0)
  }, [])

  const toggleRecording = useCallback(() => {
    if (listening) stopRecording()
    else startRecording()
  }, [listening, startRecording, stopRecording])

  const copyMessage = useCallback(async (id, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1000)
    } catch { /* clipboard fail silently */ }
  }, [])

  const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  const spawnHeart = useCallback(() => {
    const id = Date.now() + Math.random()
    const left = 5 + Math.random() * 90
    setFloatingHearts(prev => [...prev, { id, left }])
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h.id !== id))
    }, 2500)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    localStorage.removeItem('fala_messages')
    setShowClearModal(false)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }, [installPrompt])

  if (checking) return null

  return (
    <div className="app">
      <button className="heart-btn" onClick={spawnHeart}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {floatingHearts.map(h => (
        <div key={h.id} className="floating-heart" style={{ left: `${h.left}%` }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#dc2626" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
      ))}

      {messages.length > 0 && (
        <button className="clear-btn" onClick={() => setShowClearModal(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {showClearModal && (
        <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <p>Limpar todas as mensagens?</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowClearModal(false)}>Cancelar</button>
              <button className="modal-btn confirm" onClick={clearMessages}>Limpar</button>
            </div>
          </div>
        </div>
      )}

      {installPrompt && (
        <div className="install-bar">
          <button className="install-btn" onClick={handleInstall}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Instalar app
          </button>
        </div>
      )}

      {micAllowed && (
        <div className="chat-area">
          <div className="chat-fade" />
          <div className="chat-scroll">
            <div className="chat-spacer" />
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`msg-box ${copiedId === msg.id ? 'copied' : ''}`}
                onClick={() => copyMessage(msg.id, msg.text)}
              >
                <p>{msg.text}</p>
                <svg className="copy-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      <div className="bottom-bar">
        {error && <p className="error">{error}</p>}

        {!micAllowed ? (
          <button className="action-btn" onClick={requestMic}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.08 1.32-.22 1.94" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Permitir microfone
          </button>
        ) : listening ? (
          <div className="recording-bar">
            <button className="cancel-btn" onClick={cancelRecording}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <canvas ref={canvasRef} className="waveform" width="300" height="40" />
            <div className="timer">
              <span className="timer-elapsed">{formatTime(elapsed)}</span>
              <span className="timer-separator">/</span>
              <span className="timer-limit">0:55</span>
            </div>
            <button className="stop-btn" onClick={stopRecording}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            className="action-btn"
            onClick={toggleRecording}
            disabled={processing}
          >
            {processing ? (
              <>
                <span className="spinner" />
                Transcrevendo...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="1" width="6" height="11" rx="3" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Toque para gravar
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default App
