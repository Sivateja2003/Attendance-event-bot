import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE, WS_BASE, apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const WS_URL = `${WS_BASE}/ws/display`
const REFRESH_MS = 5000

/* ── Clock ─────────────────────────────────────────────────────── */
function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="dp-clock">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  )
}

/* ── Idle screen ────────────────────────────────────────────────── */
function IdleScreen({ connected, eventName }) {
  return (
    <div className="dp-idle">
      <div className="dp-pulse-wrap">
        <div className="dp-pulse-ring" />
        <div className="dp-pulse-dot" />
      </div>
      <div className="dp-brand">FaceAttend</div>
      {eventName && <div className="dp-idle-event">{eventName}</div>}
      <Clock />
      <div className="dp-idle-sub">
        {connected ? 'Scan your face to check in' : 'Connecting to server…'}
      </div>
    </div>
  )
}

/* ── Face-scan result card ──────────────────────────────────────── */
function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="dp-detail-row">
      <span className="dp-detail-label">{label}</span>
      <span className="dp-detail-value">{value}</span>
    </div>
  )
}

function PersonCard({ data }) {
  const { user, event_name, timestamp, type } = data
  const isNotEnrolled = type === 'not_enrolled'
  const checkedIn = user.already_attended
  const time = new Date(timestamp + 'Z').toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  return (
    <div className={`dp-card ${isNotEnrolled ? 'dp-card--warn' : ''}`}>
      <div className="dp-photo-side">
        <UserAvatar src={user.image_url} name={user.name} imgClass="dp-photo" fallbackClass="dp-photo dp-photo--placeholder" apiBase={API_BASE}>
          {user.name?.[0]?.toUpperCase()}
        </UserAvatar>
      </div>
      <div className="dp-info-side">
        <div className="dp-name">{user.name}</div>
        {isNotEnrolled ? (
          <div className="dp-badge dp-badge--warn">⚠ Not Enrolled for This Event</div>
        ) : checkedIn ? (
          <div className="dp-badge dp-badge--already">✓ Already Checked In</div>
        ) : (
          <div className="dp-badge dp-badge--present">✓ Checked In</div>
        )}
        {event_name && <div className="dp-event-name">◆ {event_name}</div>}
        <div className="dp-time">{time}</div>
        {!isNotEnrolled && (
          <div className="dp-details">
            <DetailRow label="Email"      value={user.email} />
            <DetailRow label="Phone"      value={user.phone} />
            <DetailRow label="Occupation" value={user.occupation} />
            <DetailRow label="LinkedIn"   value={user.linkedin} />
          </div>
        )}
        {isNotEnrolled && (
          <p className="dp-not-enrolled-msg">
            Please go to the Spotregister desk to register for this event.
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Single participant profile ─────────────────────────────────── */
function ParticipantProfile({ person, index, total, eventName, onBack, onPrev, onNext }) {
  return (
    <div className="dp-part-profile" key={`${person.id}-${index}`}>
      <button className="dp-back-btn" onClick={onBack}>← Back</button>

      <div className="dp-part-counter">
        {index + 1} / {total}
        {eventName && <span className="dp-part-event-badge">◆ {eventName}</span>}
      </div>

      <div className="dp-part-photo-side">
        <UserAvatar
          src={person.image_url}
          name={person.name}
          imgClass="dp-part-big-photo"
          fallbackClass="dp-part-big-avatar"
          apiBase={API_BASE}
        >
          {person.name?.[0]?.toUpperCase()}
        </UserAvatar>
      </div>

      <div className="dp-part-info-side">
        <div className="dp-part-profile-name">{person.name}</div>
        <div className="dp-badge dp-badge--present" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>
          ✓ Checked In
        </div>
        {person.occupation && (
          <div className="dp-part-profile-occupation">{person.occupation}</div>
        )}
        <div className="dp-part-profile-details">
          {person.email && (
            <div className="dp-part-profile-row">
              <span className="dp-part-profile-icon">✉</span>
              <span>{person.email}</span>
            </div>
          )}
          {person.phone && (
            <div className="dp-part-profile-row">
              <span className="dp-part-profile-icon">📞</span>
              <span>{person.phone}</span>
            </div>
          )}
          {person.linkedin && (
            <div className="dp-part-profile-row">
              <span className="dp-part-profile-icon">🔗</span>
              <span style={{ wordBreak: 'break-all' }}>{person.linkedin}</span>
            </div>
          )}
          {person.checked_in_at && (
            <div className="dp-part-profile-row">
              <span className="dp-part-profile-icon">🕐</span>
              <span>
                {new Date(person.checked_in_at + 'Z').toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>

        {total > 1 && (
          <div className="dp-part-dots">
            {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
              <div key={i} className={`dp-part-dot ${i === index % 12 ? 'active' : ''}`} />
            ))}
            {total > 12 && <span className="dp-part-dots-more">+{total - 12}</span>}
          </div>
        )}
      </div>

      <div className="dp-part-nav">
        <button className="dp-part-nav-btn" onClick={onPrev} disabled={index === 0}>
          ← Previous
        </button>
        <button className="dp-part-nav-btn" onClick={onNext} disabled={index >= total - 1}>
          Next →
        </button>
      </div>
    </div>
  )
}

/* ── Celebration sound ──────────────────────────────────────────── */
function playCheckInSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const notes = [523.25, 659.25, 783.99, 1046.50] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.1
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      osc.start(t)
      osc.stop(t + 0.3)
    })
  } catch (e) {}
}

/* ── Scan popup ─────────────────────────────────────────────────── */
function ScanPopup({ data }) {
  const { user } = data
  return (
    <div className="dp-popup">
      <div className="dp-popup-emoji">🎉</div>
      <UserAvatar
        src={user.image_url}
        name={user.name}
        imgClass="dp-popup-photo"
        fallbackClass="dp-popup-avatar"
        apiBase={API_BASE}
      >
        {user.name?.[0]?.toUpperCase()}
      </UserAvatar>
      <div className="dp-popup-name">{user.name}</div>
      <div className="dp-popup-sub">Just checked in! 🎊</div>
    </div>
  )
}

/* ── Main DisplayPage ───────────────────────────────────────────── */
export default function DisplayPage() {
  const { eventId } = useParams()
  const numericEventId = eventId ? Number(eventId) : null

  const [person, setPerson]             = useState(null)
  const [connected, setConnected]       = useState(false)
  const [eventName, setEventName]       = useState(null)
  const [eventNotFound, setEventNotFound] = useState(false)
  const [view, setView]                 = useState('main')  // 'main' | 'profiles'
  const [participants, setParticipants] = useState([])
  const [partIndex, setPartIndex]       = useState(0)
  const [partLoading, setPartLoading]   = useState(false)
  const [popup, setPopup]               = useState(null)

  const touchStartX    = useRef(0)
  const touchStartY    = useRef(0)
  const mouseStartX    = useRef(null)
  const hasSeenScan    = useRef(false)
  const popupTimer     = useRef(null)
  const idleTimer      = useRef(null)

  const IDLE_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour

  /* ── Fetch event name ── */
  useEffect(() => {
    if (!numericEventId) return
    apiFetch('/api/events')
      .then(r => r.json())
      .then(events => {
        const ev = events.find(e => e.id === numericEventId)
        if (ev) setEventName(ev.name)
        else setEventNotFound(true)
      })
      .catch(() => {})
  }, [numericEventId])

  /* ── Load participants ── */
  const loadParticipants = useCallback(() => {
    const url = numericEventId
      ? `/api/attendance/present?event_id=${numericEventId}`
      : '/api/attendance/present'
    setPartLoading(true)
    apiFetch(url)
      .then(r => r.json())
      .then(data => { setParticipants(data); setPartLoading(false) })
      .catch(() => setPartLoading(false))
  }, [numericEventId])

  useEffect(() => {
    if (view !== 'profiles') return
    loadParticipants()
    const t = setInterval(loadParticipants, REFRESH_MS)
    return () => clearInterval(t)
  }, [view, loadParticipants])

  /* ── Clamp index ── */
  useEffect(() => {
    if (participants.length > 0 && partIndex >= participants.length)
      setPartIndex(participants.length - 1)
  }, [participants, partIndex])

  /* ── WebSocket ── */
  useEffect(() => {
    let reconnectTimer

    function connect() {
      const ws = new WebSocket(WS_URL)
      ws.onopen  = () => setConnected(true)
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (numericEventId !== null && data.event_id !== numericEventId) return

        // Show popup + sound for every scan after the first
        if (hasSeenScan.current) {
          clearTimeout(popupTimer.current)
          setPopup(data)
          playCheckInSound()
          popupTimer.current = setTimeout(() => setPopup(null), 4000)
        }
        hasSeenScan.current = true

        // Reset 1-hour idle timer on every scan
        clearTimeout(idleTimer.current)
        idleTimer.current = setTimeout(() => setPerson(null), IDLE_TIMEOUT_MS)

        setPerson(data)
        setView('main')
      }
      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      clearTimeout(idleTimer.current)
    }
  }, [numericEventId])

  /* ── Swipe / drag ── */
  function handleTouchStart(e) {
    if (e.target.closest('button')) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function handleTouchEnd(e) {
    if (e.target.closest('button')) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx)) return
    handleSwipe(dx)
  }
  function handleMouseDown(e) {
    if (e.target.closest('button')) return
    mouseStartX.current = e.clientX
  }
  function handleMouseUp(e) {
    if (e.target.closest('button')) { mouseStartX.current = null; return }
    if (mouseStartX.current === null) return
    const dx = e.clientX - mouseStartX.current
    mouseStartX.current = null
    handleSwipe(dx)
  }

  function handleSwipe(dx) {
    if (Math.abs(dx) < 60) return
    if (view === 'main') {
      if (dx < 0) { setView('profiles'); loadParticipants() }
      return
    }
    if (view === 'profiles') {
      if (dx > 0) {
        if (partIndex > 0) setPartIndex(i => i - 1)
        else setView('main')
      } else {
        if (partIndex < participants.length - 1) setPartIndex(i => i + 1)
      }
    }
  }

  const isFlipped = view !== 'main'

  if (eventNotFound) {
    return (
      <div className="dp-page">
        <div className="dp-idle">
          <div className="dp-brand">FaceAttend</div>
          <div style={{ fontSize: '3rem', margin: '16px 0' }}>⚠</div>
          <div style={{ fontSize: '1.3rem', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            This event no longer exists.
          </div>
          <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
            Ask the organiser for the updated display link.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="dp-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className={`dp-flipper ${isFlipped ? 'dp-flipper--flipped' : ''}`}>

        {/* ── Front — main display ── */}
        <div className="dp-face dp-face--front">
          {person ? <PersonCard data={person} /> : <IdleScreen connected={connected} eventName={eventName} />}
          <button
            className="dp-open-participants-btn"
            onClick={() => { setView('profiles'); loadParticipants() }}
          >
            Open Participants
          </button>
          <div className="dp-swipe-hint dp-swipe-hint--left">
            <span className="dp-swipe-arrow">‹</span> swipe to see attendees
          </div>
        </div>

        {/* ── Back — participant profiles ── */}
        <div className="dp-face dp-face--back">
          {view === 'profiles' && (
            <>
              {partLoading && participants.length === 0 ? (
                <div className="dp-part-loading">Loading participants…</div>
              ) : participants.length === 0 ? (
                <div className="dp-part-empty">
                  <div>No one has checked in yet.</div>
                  {eventName && <div style={{ color: 'var(--accent)', marginTop: 8 }}>{eventName}</div>}
                  <button className="dp-back-btn" style={{ position: 'static', marginTop: 24 }} onClick={() => setView('main')}>
                    ← Back
                  </button>
                </div>
              ) : (
                <ParticipantProfile
                  key={partIndex}
                  person={participants[partIndex]}
                  index={partIndex}
                  total={participants.length}
                  eventName={eventName}
                  onBack={() => setView('main')}
                  onPrev={() => partIndex > 0 ? setPartIndex(i => i - 1) : setView('main')}
                  onNext={() => partIndex < participants.length - 1 && setPartIndex(i => i + 1)}
                />
              )}

              {participants.length > 0 && (
                <>
                  <div className="dp-swipe-hint dp-swipe-hint--left">
                    <span className="dp-swipe-arrow">‹</span>
                    {partIndex === 0 ? ' back' : ' previous'}
                  </div>
                  {partIndex < participants.length - 1 && (
                    <div className="dp-swipe-hint dp-swipe-hint--right">
                      next <span className="dp-swipe-arrow">›</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

      </div>

      {popup && <ScanPopup data={popup} />}
    </div>
  )
}
