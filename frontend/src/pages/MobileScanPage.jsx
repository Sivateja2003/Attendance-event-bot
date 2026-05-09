import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import { apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
const DETECT_EVERY_MS = 300
const RESULT_DISPLAY_MS = 5000
const MIN_FACE_RATIO = 0.18

export default function MobileScanPage() {
  const { eventId } = useParams()
  const webcamRef = useRef(null)
  const rafRef = useRef(null)
  const activeRef = useRef(false)
  const stateRef = useRef('idle')
  const recognitionRef = useRef(null)

  const [uiState, setUiState] = useState('idle')
  const [result, setResult] = useState(null)
  const [modelsReady, setModelsReady] = useState(false)
  const [modelError, setModelError] = useState(false)
  const [event, setEvent] = useState(null)
  const [eventError, setEventError] = useState(false)

  function setState(s) {
    stateRef.current = s
    setUiState(s)
  }

  // Load event info and face detection models in parallel
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
    }
  }, [eventId])

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
              setResult({ status: 'multi_face', message: 'Multiple faces detected. Please step up one at a time.' })
              setState('result')
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
          ? `Already checked in — ${data.user.name}`
          : `Welcome, ${data.user.name}!`
        setResult({ type: 'success', already: data.user.already_attended, user: data.user, message: msg })
        setState('result')
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered_for_event') {
        const name = data.user?.name || 'You'
        setResult({ type: 'not_enrolled', name, message: `${name} is not registered for this event.` })
        setState('result')
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered') {
        setResult({ type: 'unknown', message: 'Face not recognised. Please register first.' })
        setState('result')
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'low_confidence') {
        setResult({ type: 'warning', message: 'Face unclear. Look directly at the camera.' })
        setState('result')
        setTimeout(resetToWatching, 2500)

      } else if (data.status === 'spoof_detected') {
        setResult({ type: 'error', message: 'Liveness check failed. Use your real face.' })
        setState('result')
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
    activeRef.current = true
    setState('watching')
    startLoop()
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
      {/* Event header */}
      <div className="mscan-header">
        <div className="mscan-brand">FaceAttend</div>
        {event && <div className="mscan-event-name">{event.name}</div>}
      </div>

      {/* Camera area */}
      <div className="mscan-camera-wrap">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.85}
          videoConstraints={{ facingMode: 'user' }}
          className="mscan-webcam"
        />

        {/* Face frame */}
        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className="mscan-face-frame">
            <div className="mscan-corner mscan-tl" />
            <div className="mscan-corner mscan-tr" />
            <div className="mscan-corner mscan-bl" />
            <div className="mscan-corner mscan-br" />
          </div>
        )}

        {/* Status indicator */}
        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className={`mscan-status ${uiState}`}>
            <span className="mscan-dot" />
            {uiState === 'identifying' ? 'Identifying...' : 'Looking for face...'}
          </div>
        )}

        {/* Result overlay */}
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
              </div>
            )}
            {result.type === 'not_enrolled' && (
              <div className="mscan-result-card">
                <div className="mscan-result-icon-big mscan-icon--warn">!</div>
                <div className="mscan-result-name">{result.name}</div>
                <div className="mscan-result-msg">{result.message}</div>
              </div>
            )}
            {(result.type === 'unknown' || result.type === 'error') && (
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

        {/* Start overlay */}
        {(uiState === 'idle') && (
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
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
