import { useRef, useState, useEffect, useCallback } from 'react'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const DETECT_EVERY_MS = 250
const RESULT_DISPLAY_MS = 5000
const NO_FACE_COOLDOWN_MS = 2000
const MIN_FACE_RATIO = 0.10   // lowered: face only needs to be 10% of frame width

function getFemalVoice() {
  const voices = window.speechSynthesis.getVoices()
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

function speak(text) {
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = getFemalVoice()
  if (voice) u.voice = voice
  u.pitch = 1.2
  u.rate = 0.92
  u.volume = 1.0
  window.speechSynthesis.speak(u)
}

export default function AttendancePage() {
  const webcamRef = useRef(null)
  const rafRef = useRef(null)
  const activeRef = useRef(false)
  const stateRef = useRef('idle')
  const recognitionRef = useRef(null)

  const [uiState, setUiState] = useState('idle')
  const [result, setResult] = useState(null)
  const [modelsReady, setModelsReady] = useState(false)
  const [modelError, setModelError] = useState(false)

  // Event state
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [newEventName, setNewEventName] = useState('')
  const [showNewEventInput, setShowNewEventInput] = useState(false)
  const [eventLoading, setEventLoading] = useState(false)

  function setState(s) {
    stateRef.current = s
    setUiState(s)
  }

  useEffect(() => {
    faceapi.nets.tinyFaceDetector
      .loadFromUri(MODEL_URL)
      .then(() => { setModelsReady(true); setUiState('idle') })
      .catch(() => setModelError(true))
  }, [])

  async function fetchEvents() {
    try {
      const res = await fetch('/api/events')
      const data = await res.json()
      setEvents(data)
    } catch {
      // ignore
    }
  }

  async function handleCreateEvent() {
    const name = newEventName.trim()
    if (!name) return
    setEventLoading(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const event = await res.json()
      setEvents(prev => [event, ...prev])
      setSelectedEvent(event)
      setNewEventName('')
      setShowNewEventInput(false)
    } finally {
      setEventLoading(false)
    }
  }

  async function handleDeleteEvent(e, event) {
    e.stopPropagation()
    if (!window.confirm(`Delete event "${event.name}"? This cannot be undone.`)) return
    await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(ev => ev.id !== event.id))
    if (selectedEvent?.id === event.id) setSelectedEvent(null)
  }

  function handleStartScanning() {
    if (!selectedEvent) return
    activeRef.current = true
    setState('watching')
    startLoop()
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
              setResult({ status: 'multi_face', message: 'Multiple faces detected. Please step up one at a time.' })
              setState('multi_face')
              setTimeout(resetToWatching, 2500)
              return
            }

            if (hits.length === 1) {
              const frameWidth = video.videoWidth || video.clientWidth
              const faceWidth = hits[0].box.width
              if (faceWidth / frameWidth >= MIN_FACE_RATIO) {
                const imageSrc = webcamRef.current?.getScreenshot()
                if (imageSrc) {
                  setState('identifying')
                  await recognitionRef.current(imageSrc)
                  return
                }
              }
            }
          } catch {
            // ignore transient detection errors
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const handleRecognition = async (imageSrc) => {
    try {
      const res = await fetch('/api/attendance/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc, event_id: selectedEvent?.id ?? null }),
      })
      const data = await res.json()

      if (data.status === 'matched') {
        const msg = data.user.already_attended
          ? `${getTimeGreeting()}, ${data.user.name}! You are already checked in.`
          : `${getTimeGreeting()}, ${data.user.name}! Welcome to the event!`
        setResult({ ...data, message: msg })
        setState('matched')
        speak(msg)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered_for_event') {
        const name = data.user?.name || 'You'
        setResult({ status: 'not_enrolled', name, message: `${name} is not registered for this event. Please go to the Spotregister desk.` })
        setState('not_registered')
        speak(`${name} is not registered for this event. Please go to the Spotregister desk.`)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered') {
        setResult({ status: 'not_registered', message: "Face not recognised. Please register at the Spotregister desk." })
        setState('not_registered')
        speak("Face not recognised. Please register at the Spotregister desk.")
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'low_confidence') {
        setResult({ status: 'low_confidence', message: "Face unclear. Please look directly at the camera." })
        setState('low_confidence')
        speak("Please look directly at the camera.")
        setTimeout(resetToWatching, 2500)

      } else if (data.status === 'spoof_detected') {
        setResult({ status: 'spoof_detected', message: "Liveness check failed. Please use your real face." })
        setState('spoof_detected')
        speak("Liveness check failed.")
        setTimeout(resetToWatching, 3000)

      } else if (data.status === 'multi_face') {
        setResult({ status: 'multi_face', message: 'Multiple faces detected. Please step up one at a time.' })
        setState('multi_face')
        setTimeout(resetToWatching, 2500)

      } else {
        setTimeout(() => {
          if (activeRef.current) { setState('watching'); startLoop() }
        }, NO_FACE_COOLDOWN_MS)
      }
    } catch {
      setTimeout(() => {
        if (activeRef.current) { setState('watching'); startLoop() }
      }, NO_FACE_COOLDOWN_MS)
    }
  }

  function resetToWatching() {
    setResult(null)
    setState('watching')
    if (activeRef.current) startLoop()
  }

  recognitionRef.current = handleRecognition

  function handleActivate() {
    speak(' ')
    fetchEvents()
    setState('event_select')
  }

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="attendance-page">
      <div className="camera-wrapper">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.85}
          videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
          className="webcam"
        />

        {/* Active event badge */}
        {selectedEvent && (uiState === 'watching' || uiState === 'identifying') && (
          <div className="event-badge">{selectedEvent.name}</div>
        )}

        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className={`scan-indicator ${uiState}`}>
            <span className="scan-dot" />
            {uiState === 'watching' ? 'Watching for a face...' : 'Identifying...'}
          </div>
        )}

        {uiState === 'watching' && (
          <div className="face-frame">
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
          </div>
        )}

        {result && (
          <div className={`result-overlay ${result.status}`}>
            {result.status === 'matched' && (
              <div className="result-card matched">
                {result.user?.image_url && (
                  <img src={result.user.image_url} alt={result.user.name} className="result-photo" />
                )}
                <div className="result-text">
                  <div className="result-icon">✓</div>
                  <div className="result-name">{result.user?.name}</div>
                  <div className="result-message">{result.message}</div>
                </div>
              </div>
            )}
            {result.status === 'not_enrolled' && (
              <div className="result-card not-registered">
                <div className="result-icon">!</div>
                <div className="result-name" style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{result.name}</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
            {result.status === 'not_registered' && (
              <div className="result-card not-registered">
                <div className="result-icon">✕</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
            {result.status === 'low_confidence' && (
              <div className="result-card low-confidence">
                <div className="result-icon">?</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
            {result.status === 'multi_face' && (
              <div className="result-card multi-face">
                <div className="result-icon">!</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
            {result.status === 'spoof_detected' && (
              <div className="result-card spoof-detected">
                <div className="result-icon">✕</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
          </div>
        )}

        {/* Initial activate overlay */}
        {(uiState === 'idle' || uiState === 'models_loading') && (
          <div className="activate-overlay">
            <div className="activate-card">
              <div className="activate-icon">⬤</div>
              <h2>Face Attendance System</h2>
              {modelError ? (
                <p style={{ color: 'var(--accent-red)' }}>
                  Failed to load models. Check your internet connection and refresh.
                </p>
              ) : (
                <p>
                  {modelsReady
                    ? 'Click to start. Camera will detect and identify faces automatically.'
                    : 'Loading face detection models...'}
                </p>
              )}
              <button
                className="btn-activate"
                onClick={handleActivate}
                disabled={!modelsReady || modelError}
              >
                {modelsReady ? 'Start Attendance' : 'Please wait...'}
              </button>
            </div>
          </div>
        )}

        {/* Event selector overlay */}
        {uiState === 'event_select' && (
          <div className="activate-overlay">
            <div className="activate-card event-select-card">
              <h2>Select Event</h2>
              <p>Choose an existing event or create a new one to begin scanning.</p>

              {events.length > 0 && (
                <div className="event-list">
                  {events.map(e => (
                    <div key={e.id} className={`event-option ${selectedEvent?.id === e.id ? 'selected' : ''}`} onClick={() => setSelectedEvent(e)}>
                      <span className="event-option-name">{e.name}</span>
                      <button className="event-delete-btn" onClick={ev => handleDeleteEvent(ev, e)} title="Delete event">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {!showNewEventInput ? (
                <button className="btn-secondary" onClick={() => setShowNewEventInput(true)}>
                  + New Event
                </button>
              ) : (
                <div className="new-event-row">
                  <input
                    className="event-input"
                    placeholder="Event name"
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateEvent()}
                    autoFocus
                  />
                  <button
                    className="btn-activate"
                    onClick={handleCreateEvent}
                    disabled={eventLoading || !newEventName.trim()}
                  >
                    {eventLoading ? '...' : 'Create'}
                  </button>
                </div>
              )}

              <button
                className="btn-activate"
                style={{ marginTop: '16px' }}
                onClick={handleStartScanning}
                disabled={!selectedEvent}
              >
                {selectedEvent ? `Start — ${selectedEvent.name}` : 'Select an event first'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
