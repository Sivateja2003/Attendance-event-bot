import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import { apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
const DETECT_EVERY_MS = 300
const RESULT_DISPLAY_MS = 3000
const MIN_FACE_RATIO = 0.18

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

// Prime voice list — mobile browsers load voices asynchronously
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
}

function getFemaleVoice() {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const preferred = [
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Eva - English (United States)',
    'Microsoft Zira - English (United States)',
    'Google US English',
  ]
  for (const name of preferred) {
    const v = voices.find(v => v.name === name)
    if (v) return v
  }
  return (
    voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang.startsWith('en') && /zira|eva|aria|jenny|hazel|susan|karen|samantha|victoria|fiona/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  )
}

// Unlock AudioContext (iOS requires this to happen inside a user-gesture handler)
function unlockAudioContext() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    ctx.resume?.()
  } catch (_) {}
}

// showBanner is a callback to display text visually when audio may be silent
function speak(text, showBanner) {
  showBanner?.(text)
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    // 100ms delay: iOS needs time after cancel() before a new utterance works;
    // also gives onvoiceschanged a chance to fire on first use
    setTimeout(() => {
      try {
        const u = new SpeechSynthesisUtterance(text)
        const voice = getFemaleVoice()
        if (voice) u.voice = voice
        u.lang = 'en-US'
        u.pitch = 1.1
        u.rate = 0.92
        u.volume = 1.0
        window.speechSynthesis.speak(u)
      } catch (_) {}
    }, 100)
  } catch (_) {}
}

export default function MobileScanPage() {
  const { eventId } = useParams()
  const webcamRef = useRef(null)
  const rafRef = useRef(null)
  const activeRef = useRef(false)
  const stateRef = useRef('idle')
  const recognitionRef = useRef(null)
  const keepaliveRef = useRef(null)

  const [uiState, setUiState] = useState('idle')
  const [result, setResult] = useState(null)
  const [modelsReady, setModelsReady] = useState(false)
  const [modelError, setModelError] = useState(false)
  const [event, setEvent] = useState(null)
  const [eventError, setEventError] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [spokenText, setSpokenText] = useState('')
  const bannerTimerRef = useRef(null)

  function showBanner(text) {
    clearTimeout(bannerTimerRef.current)
    setSpokenText(text)
    bannerTimerRef.current = setTimeout(() => setSpokenText(''), 4000)
  }

  function setState(s) {
    stateRef.current = s
    setUiState(s)
  }

  useEffect(() => {
    apiFetch(`/api/events/${eventId}/info`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setEvent(data))
      .catch(() => setEventError(true))

    faceapi.nets.tinyFaceDetector
      .loadFromUri(MODEL_URL)
      .then(() => setModelsReady(true))
      .catch(() => setModelError(true))

    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (keepaliveRef.current) clearInterval(keepaliveRef.current)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [eventId])

  // iOS Safari stops speech synthesis after ~30s of inactivity.
  // Keep it alive by pausing/resuming every 10s while scanning.
  function startKeepalive() {
    if (keepaliveRef.current) clearInterval(keepaliveRef.current)
    keepaliveRef.current = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 10000)
  }

  function stopKeepalive() {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current)
      keepaliveRef.current = null
    }
  }

  const startLoop = useCallback(() => {
    let lastRun = 0
    const tick = async (ts) => {
      if (!activeRef.current || stateRef.current !== 'watching') return
      if (ts - lastRun >= DETECT_EVERY_MS) {
        lastRun = ts
        const video = webcamRef.current?.video
        if (video && video.readyState === 4) {
          try {
            const hits = await faceapi.detectAllFaces(
              video,
              new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 })
            )
            if (stateRef.current !== 'watching') return
            if (hits.length > 1) {
              setResult({ type: 'multi_face', message: 'Multiple faces. Please step up one at a time.' })
              setState('result')
              speak('Multiple faces detected. Please step up one at a time.', showBanner)
              setTimeout(resetToWatching, 2500)
              return
            }
            if (hits.length === 1) {
              const frameWidth = video.videoWidth || video.clientWidth
              if (hits[0].box.width / frameWidth >= MIN_FACE_RATIO) {
                const { x, y, width: fw, height: fh } = hits[0].box
                const pad = Math.round(fw * 0.3)
                const sx = Math.max(0, Math.round(x - pad))
                const sy = Math.max(0, Math.round(y - pad))
                const sw = Math.min(video.videoWidth, Math.round(fw + pad * 2))
                const sh = Math.min(video.videoHeight, Math.round(fh + pad * 2))
                const canvas = document.createElement('canvas')
                canvas.width = sw; canvas.height = sh
                canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
                setState('identifying')
                await recognitionRef.current(canvas.toDataURL('image/jpeg', 0.85))
                return
              }
            }
          } catch { /* ignore transient errors */ }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const handleRecognition = async (imageSrc) => {
    try {
      const res = await apiFetch('/api/attendance/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc, event_id: parseInt(eventId) }),
      })
      const data = await res.json()

      if (data.status === 'matched') {
        const msg = data.user.already_attended
          ? `Welcome back, ${data.user.name}! You are already checked in.`
          : `Welcome, ${data.user.name}! You have been checked in successfully.`
        setResult({ type: 'success', already: data.user.already_attended, user: data.user, message: msg })
        setState('result')
        speak(msg, showBanner)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered_for_event') {
        const name = data.user?.name || 'You'
        const msg = `${name} is not registered for this event. Please go to the registration desk.`
        setResult({ type: 'not_enrolled', name, message: msg })
        setState('result')
        speak(msg, showBanner)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered') {
        const msg = 'Face not recognised. Please register first.'
        setResult({ type: 'unknown', message: msg })
        setState('result')
        speak(msg, showBanner)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'low_confidence') {
        const msg = 'Face unclear. Please look directly at the camera.'
        setResult({ type: 'warning', message: msg })
        setState('result')
        speak(msg, showBanner)
        setTimeout(resetToWatching, 2500)

      } else if (data.status === 'spoof_detected') {
        const msg = 'Liveness check failed. Please use your real face.'
        setResult({ type: 'error', message: msg })
        setState('result')
        speak(msg, showBanner)
        setTimeout(resetToWatching, 3000)

      } else {
        setTimeout(() => {
          if (activeRef.current) { setState('watching'); startLoop() }
        }, 2000)
      }
    } catch {
      setTimeout(() => {
        if (activeRef.current) { setState('watching'); startLoop() }
      }, 2000)
    }
  }

  recognitionRef.current = handleRecognition

  function resetToWatching() {
    setResult(null)
    setState('watching')
    if (activeRef.current) startLoop()
  }

  function handleStart() {
    // Both steps must happen synchronously inside this user-gesture handler
    // so iOS considers them authorized
    unlockAudioContext()
    speak('Sound enabled. Starting face check-in.', showBanner)
    setSoundEnabled(true)
    activeRef.current = true
    setState('watching')
    startKeepalive()
    startLoop()
  }

  // Let user re-enable sound mid-session if iOS re-blocked it
  function handleReenableSound() {
    unlockAudioContext()
    speak('Sound re-enabled.', showBanner)
    setSoundEnabled(true)
  }

  if (eventError) {
    return (
      <div className="mscan-page">
        <div className="mscan-error-screen">
          <div className="mscan-error-icon">✕</div>
          <div className="mscan-error-title">Event Not Found</div>
          <div className="mscan-error-sub">This QR code is no longer valid. The event may have been deleted.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mscan-page">
      <div className="mscan-header">
        <div className="mscan-brand">FaceAttend</div>
        {event && <div className="mscan-event-name">{event.name}</div>}
      </div>

      <div className="mscan-camera-wrap">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.85}
          videoConstraints={{ facingMode: 'user' }}
          className="mscan-webcam"
        />

        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className="mscan-face-frame">
            <div className="mscan-corner mscan-tl" />
            <div className="mscan-corner mscan-tr" />
            <div className="mscan-corner mscan-bl" />
            <div className="mscan-corner mscan-br" />
          </div>
        )}

        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className={`mscan-status ${uiState}`}>
            <span className="mscan-dot" />
            {uiState === 'identifying' ? 'Identifying...' : 'Looking for face...'}
          </div>
        )}

        {/* Sound re-enable button — visible while scanning, in case iOS re-blocks audio */}
        {(uiState === 'watching' || uiState === 'identifying') && (
          <button className="mscan-sound-btn" onClick={handleReenableSound} title="Tap if you can't hear announcements">
            🔊
          </button>
        )}

        {/* Visual speech banner — shows spoken text for silent-mode / unsupported devices */}
        {spokenText && (
          <div className="mscan-speech-banner">
            🔊 {spokenText}
          </div>
        )}

        {uiState === 'result' && result && (
          <div className={`mscan-result-overlay mscan-result--${result.type}`}>
            {result.type === 'success' && (
              <div className="mscan-result-card">
                <UserAvatar
                  src={result.user?.image_url}
                  name={result.user?.name}
                  imgClass="mscan-result-photo"
                  fallbackClass="mscan-result-photo-placeholder"
                />
                <div className={`mscan-result-badge ${result.already ? 'already' : 'checkedin'}`}>
                  {result.already ? 'Already Checked In' : 'Checked In ✓'}
                </div>
                <div className="mscan-result-name">{result.user?.name}</div>
                {result.user?.occupation && (
                  <div className="mscan-result-detail">{result.user.occupation}</div>
                )}
                {result.user?.email && (
                  <div className="mscan-result-detail">✉ {result.user.email}</div>
                )}
                {result.user?.phone && (
                  <div className="mscan-result-detail">📞 {result.user.phone}</div>
                )}
              </div>
            )}
            {result.type === 'not_enrolled' && (
              <div className="mscan-result-card">
                <div className="mscan-result-icon-big mscan-icon--warn">!</div>
                <div className="mscan-result-name">{result.name}</div>
                <div className="mscan-result-msg">{result.message}</div>
              </div>
            )}
            {(result.type === 'unknown' || result.type === 'error' || result.type === 'multi_face') && (
              <div className="mscan-result-card">
                <div className="mscan-result-icon-big mscan-icon--err">✕</div>
                <div className="mscan-result-msg">{result.message}</div>
              </div>
            )}
            {result.type === 'warning' && (
              <div className="mscan-result-card">
                <div className="mscan-result-icon-big mscan-icon--warn">?</div>
                <div className="mscan-result-msg">{result.message}</div>
              </div>
            )}
          </div>
        )}

        {uiState === 'idle' && (
          <div className="mscan-start-overlay">
            <div className="mscan-start-card">
              {modelError ? (
                <>
                  <div className="mscan-start-icon mscan-icon--err">✕</div>
                  <div className="mscan-start-title">Model Load Failed</div>
                  <div className="mscan-start-sub">Check your internet connection and refresh.</div>
                </>
              ) : (
                <>
                  <div className="mscan-start-icon">⬤</div>
                  {event && <div className="mscan-start-event">{event.name}</div>}
                  <div className="mscan-start-sub">
                    {modelsReady ? 'Tap to begin face check-in' : 'Loading models...'}
                  </div>
                  <button
                    className="mscan-start-btn"
                    onClick={handleStart}
                    disabled={!modelsReady || !event}
                  >
                    {modelsReady && event ? 'Start Check-In' : 'Please wait...'}
                  </button>
                  <div className="mscan-start-sound-note">🔊 Voice announcements will be enabled</div>
                  {isIOS && (
                    <div className="mscan-ios-mute-note">
                      📵 iPhone users: turn off silent mode to hear voice
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
