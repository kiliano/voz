import { useState, useEffect, useCallback } from 'react'

function App() {
  const [micAllowed, setMicAllowed] = useState(false)
  const [listening, setListening] = useState(false)
  const [checking, setChecking] = useState(true)

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

  const toggleListening = useCallback(() => {
    setListening(prev => !prev)
  }, [])

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
            onClick={toggleListening}
          >
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="11" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <span className="status">
            {listening ? 'Ouvindo...' : 'Toque para gravar'}
          </span>
        </>
      )}
    </div>
  )
}

export default App
