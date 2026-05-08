import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch, WS_BASE } from '../config'
import UserAvatar from '../components/UserAvatar'

export default function UserPortalPage() {
  const [profile, setProfile] = useState(null)
  const [myEvents, setMyEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const wsRef = useRef(null)
  const toastTimer = useRef(null)
  const selectedEventRef = useRef(null)

  useEffect(() => {
    apiFetch('/api/me/profile')
      .then(r => r.json())
      .then(setProfile)
      .catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/me/events')
      .then(r => r.json())
      .then(data => {
        setMyEvents(data)
        if (data.length === 1) setSelectedEvent(data[0])
      })
      .catch(() => {})
  }, [])

  const fetchAttendees = useCallback((eventId) => {
    setLoading(true)
    apiFetch(`/api/attendance/present?event_id=${eventId}`)
      .then(r => r.json())
      .then(setAttendees)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    selectedEventRef.current = selectedEvent
    if (selectedEvent) fetchAttendees(selectedEvent.id)
    else setAttendees([])
  }, [selectedEvent, fetchAttendees])

  useEffect(() => {
    let cancelled = false
    function connect() {
      if (cancelled) return
      const ws = new WebSocket(`${WS_BASE}/ws/display`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          const cur = selectedEventRef.current
          if (msg.type === 'match' && cur && msg.event_id === cur.id) {
            showToast(msg.user)
            fetchAttendees(cur.id)
          }
        } catch {}
      }
      ws.onclose = () => { if (!cancelled) setTimeout(connect, 3000) }
    }
    connect()
    return () => { cancelled = true; wsRef.current?.close() }
  }, [fetchAttendees])

  function showToast(person) {
    setToast(person)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  return (
    <div className="up-page">

      {toast && (
        <div className="lb-toast" onClick={() => setToast(null)}>
          <UserAvatar src={toast.image_url} name={toast.name} imgClass="lb-toast-photo" fallbackClass="lb-toast-avatar" />
          <div className="lb-toast-text">
            <span className="lb-toast-name">{toast.name}</span>
            <span className="lb-toast-msg">has just arrived!</span>
          </div>
          <button className="lb-toast-close" onClick={e => { e.stopPropagation(); setToast(null) }}>✕</button>
        </div>
      )}

      {/* Profile */}
      <div className="up-section">
        <div className="up-section-title">My Profile</div>
        {!profile ? (
          <p className="up-loading">Loading profile…</p>
        ) : (
          <div className="up-profile-card">
            <UserAvatar
              src={profile.image_url}
              name={profile.name}
              imgClass="up-profile-photo"
              fallbackClass="up-profile-avatar"
            />
            <div className="up-profile-info">
              <div className="up-profile-name">{profile.name}</div>
              {profile.occupation && (
                <div className="up-profile-occupation">{profile.occupation}</div>
              )}
              <div className="up-profile-details">
                {profile.email && (
                  <div className="up-detail-row">
                    <span className="up-detail-icon">✉</span>
                    <span>{profile.email}</span>
                  </div>
                )}
                {profile.phone && (
                  <div className="up-detail-row">
                    <span className="up-detail-icon">📞</span>
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile.linkedin && (
                  <div className="up-detail-row">
                    <span className="up-detail-icon">🔗</span>
                    <a
                      href={profile.linkedin.startsWith('http') ? profile.linkedin : `https://${profile.linkedin}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Arrivals */}
      <div className="up-section">
        <div className="up-arrivals-header">
          <div className="up-section-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            Who's Here
          </div>
          {myEvents.length > 1 && (
            <select
              className="up-event-select"
              value={selectedEvent?.id ?? ''}
              onChange={e => {
                const ev = myEvents.find(m => m.id === Number(e.target.value))
                setSelectedEvent(ev || null)
              }}
            >
              <option value="">— Pick an event —</option>
              {myEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}
          {selectedEvent && myEvents.length === 1 && (
            <span className="up-event-badge">{selectedEvent.name}</span>
          )}
        </div>

        {myEvents.length === 0 && (
          <p className="up-loading">You aren't enrolled in any events yet.</p>
        )}
        {myEvents.length > 1 && !selectedEvent && (
          <p className="up-loading">Select an event above to see who's here.</p>
        )}
        {selectedEvent && loading && (
          <p className="up-loading">Loading…</p>
        )}
        {selectedEvent && !loading && attendees.length === 0 && (
          <div className="lb-empty">
            <p>No one has checked in yet.</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              This updates live when people arrive.
            </p>
          </div>
        )}
        {selectedEvent && !loading && attendees.length > 0 && (
          <div className="lb-grid">
            {attendees.map(person => (
              <div key={person.id} className="lb-card" style={{ cursor: 'default' }}>
                <div className="lb-card-photo-wrap">
                  <UserAvatar
                    src={person.image_url}
                    name={person.name}
                    imgClass="lb-card-photo"
                    fallbackClass="lb-card-avatar"
                  />
                  <div className="lb-card-badge">✓</div>
                </div>
                <div className="lb-card-info">
                  <div className="lb-card-name">{person.name}</div>
                  {person.occupation && (
                    <div className="lb-card-occupation">{person.occupation}</div>
                  )}
                  <div className="lb-card-time">
                    {person.checked_in_at
                      ? new Date(person.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
