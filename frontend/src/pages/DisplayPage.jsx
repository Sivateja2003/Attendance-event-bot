import { useEffect, useRef, useState } from 'react'
import { API_BASE, WS_BASE } from '../config'
import UserAvatar from '../components/UserAvatar'

const DISPLAY_DURATION_MS = 7000
const WS_URL = `${WS_BASE}/ws/display`

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
      {/* Left — photo */}
      <div className="dp-photo-side">
        <UserAvatar src={user.image_url} name={user.name} imgClass="dp-photo" fallbackClass="dp-photo dp-photo--placeholder" apiBase={API_BASE}>
          {user.name?.[0]?.toUpperCase()}
        </UserAvatar>
      </div>

      {/* Right — info */}
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

      {/* Progress bar */}
      <div className="dp-progress" style={{ animationDuration: `${DISPLAY_DURATION_MS}ms` }} />
    </div>
  )
}

export default function DisplayPage() {
  const [person, setPerson] = useState(null)
  const [connected, setConnected] = useState(false)
  const clearRef = useRef(null)
  const wsRef = useRef(null)

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

  return (
    <div className="dp-page">
      {person ? <PersonCard data={person} /> : <IdleScreen connected={connected} />}
    </div>
  )
}
