import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE, WS_BASE, apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const DISPLAY_DURATION_MS = 7000
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
function IdleScreen({ connected }) {
  return (
    <div className="dp-idle">
      <div className="dp-pulse-wrap">
        <div className="dp-pulse-ring" />
        <div className="dp-pulse-dot" />
      </div>
      <div className="dp-brand">FaceAttend</div>
      <Clock />
      <div className="dp-idle-sub">
        {connected ? 'Scan your face to check in' : 'Connecting to server…'}
      </div>
    </div>
  )
}

/* ── Face-scan result card (unchanged) ─────────────────────────── */
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
      <div className="dp-progress" style={{ animationDuration: `${DISPLAY_DURATION_MS}ms` }} />
    </div>
  )
}

/* ── Event picker ───────────────────────────────────────────────── */
function EventsPanel({ events, onSelect, onBackToIdle }) {
  return (
    <div className="dp-events-panel">
      <button className="dp-back-btn" onClick={onBackToIdle}>← Back to Idle</button>
      <div className="dp-events-title">Select an Event</div>
      <p className="dp-events-sub">Tap an event to browse its participants</p>
      {events.length === 0 ? (
        <div className="dp-part-empty">No events created yet.</div>
      ) : (
        <div className="dp-events-grid">
          {events.map(ev => (
            <button key={ev.id} className="dp-event-card" onClick={() => onSelect(ev)}>
              <div className="dp-event-card-name">{ev.name}</div>
              {ev.description && (
                <div className="dp-event-card-desc">{ev.description}</div>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="dp-swipe-hint dp-swipe-hint--left">
        <span className="dp-swipe-arrow">‹</span> swipe left to go back
      </div>
    </div>
  )
}

/* ── Single participant profile ─────────────────────────────────── */
function ParticipantProfile({ person, index, total, eventName, onBackToIdle }) {
  return (
    <div className="dp-part-profile" key={`${person.id}-${index}`}>
      <button className="dp-back-btn" onClick={onBackToIdle}>← Back to Idle</button>

      {/* Counter + event badge */}
      <div className="dp-part-counter">
        {index + 1} / {total}
        {eventName && <span className="dp-part-event-badge">◆ {eventName}</span>}
      </div>

      {/* Photo */}
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

      {/* Info */}
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
    </div>
  )
}

/* ── Main DisplayPage ───────────────────────────────────────────── */
export default function DisplayPage() {
  const [person, setPerson]             = useState(null)
  const [connected, setConnected]       = useState(false)

  // view: 'main' | 'events' | 'profiles'
  const [view, setView]                 = useState('main')
  const [events, setEvents]             = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [participants, setParticipants] = useState([])
  const [partIndex, setPartIndex]       = useState(0)
  const [partLoading, setPartLoading]   = useState(false)

  const clearRef    = useRef(null)
  const wsRef       = useRef(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const mouseStartX = useRef(null)

  /* ── Load events list ── */
  useEffect(() => {
    apiFetch('/api/events').then(r => r.json()).then(setEvents).catch(() => {})
  }, [])

  /* ── Load participants for selected event ── */
  const loadParticipants = useCallback((eventId) => {
    apiFetch(`/api/attendance/present?event_id=${eventId}`)
      .then(r => r.json())
      .then(data => { setParticipants(data); setPartLoading(false) })
      .catch(() => setPartLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedEvent) return
    setPartLoading(true)
    loadParticipants(selectedEvent.id)
    const t = setInterval(() => loadParticipants(selectedEvent.id), REFRESH_MS)
    return () => clearInterval(t)
  }, [selectedEvent, loadParticipants])

  /* ── Clamp index when participants list changes ── */
  useEffect(() => {
    if (participants.length > 0 && partIndex >= participants.length)
      setPartIndex(participants.length - 1)
  }, [participants, partIndex])

  /* ── WebSocket ── */
  useEffect(() => {
    let reconnectTimer

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen  = () => setConnected(true)
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        clearTimeout(clearRef.current)
        setPerson(data)
        setView('main')
        clearRef.current = setTimeout(() => setPerson(null), DISPLAY_DURATION_MS)
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
      clearTimeout(clearRef.current)
      wsRef.current?.close()
    }
  }, [])

  /* ── Navigation helpers ── */
  function goToIdle() {
    setView('main')
    setSelectedEvent(null)
    setParticipants([])
    setPartIndex(0)
  }

  function handleEventSelect(ev) {
    setSelectedEvent(ev)
    setPartIndex(0)
    setParticipants([])
    setView('profiles')
  }

  /* ── Swipe ── */
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx)) return
    handleSwipe(dx)
  }
  function handleMouseDown(e) { mouseStartX.current = e.clientX }
  function handleMouseUp(e) {
    if (mouseStartX.current === null) return
    const dx = e.clientX - mouseStartX.current
    mouseStartX.current = null
    handleSwipe(dx)
  }

  function handleSwipe(dx) {
    if (Math.abs(dx) < 60) return

    if (view === 'main') {
      if (dx > 0 && events.length > 0) setView('events')
      return
    }
    if (view === 'events') {
      if (dx < 0) setView('main')
      return
    }
    if (view === 'profiles') {
      if (dx > 0) {
        if (partIndex < participants.length - 1) setPartIndex(i => i + 1)
      } else {
        if (partIndex > 0) setPartIndex(i => i - 1)
        else setView('events')
      }
    }
  }

  const isFlipped = view !== 'main'

  return (
    <div
      className="dp-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className={`dp-flipper ${isFlipped ? 'dp-flipper--flipped' : ''}`}>

        {/* ── Front face — main display ── */}
        <div className="dp-face dp-face--front">
          {person ? <PersonCard data={person} /> : <IdleScreen connected={connected} />}
          {events.length > 0 && (
            <div className="dp-swipe-hint dp-swipe-hint--right">
              swipe right <span className="dp-swipe-arrow">›</span>
            </div>
          )}
        </div>

        {/* ── Back face — event picker OR profiles ── */}
        <div className="dp-face dp-face--back">
          {view === 'events' && (
            <EventsPanel
              events={events}
              onSelect={handleEventSelect}
              onBackToIdle={goToIdle}
            />
          )}

          {view === 'profiles' && (
            <>
              {partLoading && participants.length === 0 ? (
                <div className="dp-part-loading">Loading participants…</div>
              ) : participants.length === 0 ? (
                <div className="dp-part-empty">
                  <div>No one has checked in for</div>
                  <div style={{ color: 'var(--accent)', marginTop: 8 }}>{selectedEvent?.name}</div>
                  <button className="dp-back-btn" style={{ position: 'static', marginTop: 24 }} onClick={() => setView('events')}>
                    ← Choose another event
                  </button>
                </div>
              ) : (
                <ParticipantProfile
                  key={partIndex}
                  person={participants[partIndex]}
                  index={partIndex}
                  total={participants.length}
                  eventName={selectedEvent?.name}
                  onBackToIdle={goToIdle}
                />
              )}

              {participants.length > 0 && (
                <>
                  <div className="dp-swipe-hint dp-swipe-hint--left">
                    <span className="dp-swipe-arrow">‹</span>
                    {partIndex === 0 ? ' events' : ' previous'}
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
    </div>
  )
}
