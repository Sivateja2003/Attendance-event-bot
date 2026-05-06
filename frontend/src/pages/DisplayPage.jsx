import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE, WS_BASE, apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const DISPLAY_DURATION_MS = 7000
const WS_URL = `${WS_BASE}/ws/display`
const REFRESH_MS = 30000

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

        {event_name && (
          <div className="dp-event-name">◆ {event_name}</div>
        )}
        <div className="dp-time">{time}</div>

        {!isNotEnrolled && (
          <div className="dp-details">
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Phone" value={user.phone} />
            <DetailRow label="Occupation" value={user.occupation} />
            <DetailRow label="LinkedIn" value={user.linkedin} />
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

function ParticipantsPanel() {
  const [participants, setParticipants] = useState([])
  const [events, setEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((eid) => {
    setLoading(true)
    const url = eid != null ? `/api/attendance/present?event_id=${eid}` : '/api/attendance/present'
    apiFetch(url)
      .then(r => r.json())
      .then(data => setParticipants(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    apiFetch('/api/events').then(r => r.json()).then(setEvents).catch(() => {})
  }, [])

  useEffect(() => {
    load(selectedEventId)
    const t = setInterval(() => load(selectedEventId), REFRESH_MS)
    return () => clearInterval(t)
  }, [selectedEventId, load])

  return (
    <div className="dp-participants">
      <div className="dp-part-header">
        <div className="dp-part-title">Who's Here</div>
        <div className="dp-part-count">{participants.length} checked in</div>
        {events.length > 1 && (
          <div className="dp-part-event-tabs">
            <button
              className={`dp-part-tab ${selectedEventId == null ? 'active' : ''}`}
              onClick={() => setSelectedEventId(null)}
            >All</button>
            {events.map(ev => (
              <button
                key={ev.id}
                className={`dp-part-tab ${selectedEventId === ev.id ? 'active' : ''}`}
                onClick={() => setSelectedEventId(ev.id)}
              >{ev.name}</button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="dp-part-loading">Loading…</div>}

      {!loading && participants.length === 0 && (
        <div className="dp-part-empty">No one has checked in yet.</div>
      )}

      {!loading && participants.length > 0 && (
        <div className="dp-part-grid">
          {participants.map(p => (
            <div key={p.id} className="dp-part-card">
              <UserAvatar
                src={p.image_url}
                name={p.name}
                imgClass="dp-part-photo"
                fallbackClass="dp-part-avatar"
                apiBase={API_BASE}
              />
              <div className="dp-part-name">{p.name}</div>
              {p.occupation && <div className="dp-part-occupation">{p.occupation}</div>}
              {p.checked_in_at && (
                <div className="dp-part-time">
                  {new Date(p.checked_in_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="dp-swipe-hint dp-swipe-hint--left">
        <span className="dp-swipe-arrow">‹</span> swipe left to go back
      </div>
    </div>
  )
}

export default function DisplayPage() {
  const [person, setPerson] = useState(null)
  const [connected, setConnected] = useState(false)
  const [view, setView] = useState('main')
  const clearRef = useRef(null)
  const wsRef = useRef(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const mouseStartX = useRef(null)

  useEffect(() => {
    let reconnectTimer

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

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

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx)) return
    if (dx > 60 && view === 'main') setView('participants')
    if (dx < -60 && view === 'participants') setView('main')
  }

  function handleMouseDown(e) {
    mouseStartX.current = e.clientX
  }

  function handleMouseUp(e) {
    if (mouseStartX.current === null) return
    const dx = e.clientX - mouseStartX.current
    mouseStartX.current = null
    if (Math.abs(dx) < 60) return
    if (dx > 0 && view === 'main') setView('participants')
    if (dx < 0 && view === 'participants') setView('main')
  }

  return (
    <div
      className="dp-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className={`dp-flipper ${view === 'participants' ? 'dp-flipper--flipped' : ''}`}>

        {/* Front face — main display */}
        <div className="dp-face dp-face--front">
          {person ? <PersonCard data={person} /> : <IdleScreen connected={connected} />}
          <div className="dp-swipe-hint dp-swipe-hint--right">
            swipe right <span className="dp-swipe-arrow">›</span>
          </div>
        </div>

        {/* Back face — participants */}
        <div className="dp-face dp-face--back">
          <ParticipantsPanel />
        </div>

      </div>
    </div>
  )
}
