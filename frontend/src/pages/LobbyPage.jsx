import { useState, useEffect, useRef, useCallback } from 'react'

export default function LobbyPage() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)          // { name, image_url }
  const [activeProfile, setActiveProfile] = useState(null)  // full profile modal
  const [search, setSearch] = useState('')
  const wsRef = useRef(null)
  const toastTimer = useRef(null)

  /* ── load events on mount ── */
  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => {
        setEvents(data)
        if (data.length === 1) setSelectedEvent(data[0])
      })
      .catch(() => {})
  }, [])

  /* ── fetch checked-in list whenever event changes ── */
  const fetchAttendees = useCallback((eventId) => {
    setLoading(true)
    const url = eventId ? `/api/attendance/present?event_id=${eventId}` : '/api/attendance/present'
    fetch(url)
      .then(r => r.json())
      .then(data => setAttendees(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedEvent) fetchAttendees(selectedEvent.id)
  }, [selectedEvent, fetchAttendees])

  /* ── WebSocket for live arrivals (through Vite proxy) ── */
  useEffect(() => {
    let cancelled = false
    function connect() {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/display`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'match') {
            showToast(data.user, data.user?.already_attended)
            if (selectedEvent) fetchAttendees(selectedEvent.id)
          }
        } catch {}
      }

      ws.onclose = () => {
        if (!cancelled) setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { cancelled = true; wsRef.current?.close() }
  }, [selectedEvent, fetchAttendees])

  function showToast(user, alreadyAttended) {
    setToast({ ...user, alreadyAttended })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  const filtered = attendees.filter(a =>
    [a.name, a.email, a.occupation]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  /* ── No event selected — show picker ── */
  if (!selectedEvent) {
    return (
      <div className="lb-page">
        <div className="lb-picker-wrap">
          <div className="lb-picker-icon">👥</div>
          <h1 className="lb-picker-title">Who's Here</h1>
          <p className="lb-picker-sub">Select an event to see who has checked in.</p>
          {events.length === 0
            ? <p className="lb-picker-none">No events found. Ask the organiser to create one.</p>
            : (
              <div className="lb-picker-events">
                {events.map(ev => (
                  <button key={ev.id} className="lb-picker-btn" onClick={() => setSelectedEvent(ev)}>
                    {ev.name}
                  </button>
                ))}
              </div>
            )
          }
        </div>
      </div>
    )
  }

  return (
    <div className="lb-page">

      {/* ── Toast notification ── */}
      {toast && (
        <div className="lb-toast" onClick={() => setToast(null)}>
          {toast.image_url
            ? <img src={toast.image_url} alt={toast.name} className="lb-toast-photo" />
            : <div className="lb-toast-avatar">{toast.name?.[0]}</div>
          }
          <div className="lb-toast-text">
            <span className="lb-toast-name">{toast.name}</span>
            <span className="lb-toast-msg">
              {toast.alreadyAttended ? 'is already checked in 👋' : 'has just arrived! 🎉'}
            </span>
          </div>
          <button className="lb-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* ── Profile modal ── */}
      {activeProfile && (
        <div className="lb-modal-backdrop" onClick={() => setActiveProfile(null)}>
          <div className="lb-modal" onClick={e => e.stopPropagation()}>
            <button className="lb-modal-close" onClick={() => setActiveProfile(null)}>✕</button>
            <div className="lb-modal-photo-wrap">
              {activeProfile.image_url
                ? <img src={activeProfile.image_url} alt={activeProfile.name} className="lb-modal-photo" />
                : <div className="lb-modal-avatar">{activeProfile.name?.[0]}</div>
              }
            </div>
            <div className="lb-modal-info">
              <h2 className="lb-modal-name">{activeProfile.name}</h2>
              {activeProfile.occupation && (
                <p className="lb-modal-occupation">{activeProfile.occupation}</p>
              )}
              <div className="lb-modal-badge">✓ Checked In</div>
              <div className="lb-modal-details">
                {activeProfile.email && (
                  <div className="lb-modal-row">
                    <span className="lb-modal-icon">✉</span>
                    <a href={`mailto:${activeProfile.email}`} className="lb-modal-link">{activeProfile.email}</a>
                  </div>
                )}
                {activeProfile.phone && (
                  <div className="lb-modal-row">
                    <span className="lb-modal-icon">📞</span>
                    <span>{activeProfile.phone}</span>
                  </div>
                )}
                {activeProfile.linkedin && (
                  <div className="lb-modal-row">
                    <span className="lb-modal-icon">🔗</span>
                    <a
                      href={activeProfile.linkedin.startsWith('http') ? activeProfile.linkedin : `https://${activeProfile.linkedin}`}
                      target="_blank"
                      rel="noreferrer"
                      className="lb-modal-link"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
                {activeProfile.checked_in_at && (
                  <div className="lb-modal-row">
                    <span className="lb-modal-icon">🕐</span>
                    <span>{new Date(activeProfile.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="lb-header">
        <div className="lb-header-left">
          <div>
            <h1 className="lb-title">Who's Here</h1>
            <p className="lb-event-name">{selectedEvent.name}</p>
          </div>
          <div className="lb-count-pill">
            <span className="lb-count-dot" />
            {attendees.length} checked in
          </div>
        </div>
        <button className="lb-change-event" onClick={() => { setSelectedEvent(null); setAttendees([]) }}>
          Change Event
        </button>
      </div>

      {/* ── Search ── */}
      <div className="lb-search-wrap">
        <input
          className="lb-search"
          placeholder="Search by name, email or occupation..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Grid ── */}
      {loading && (
        <div className="lb-loading">Loading attendees...</div>
      )}

      {!loading && attendees.length === 0 && (
        <div className="lb-empty">
          <div style={{ fontSize: 52, marginBottom: 12 }}>🚪</div>
          <p>No one has checked in yet.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>This page will update automatically when people arrive.</p>
        </div>
      )}

      {!loading && attendees.length > 0 && filtered.length === 0 && (
        <div className="lb-empty">
          <p>No attendees match "<strong>{search}</strong>"</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="lb-grid">
          {filtered.map(person => (
            <div
              key={person.id}
              className="lb-card"
              onClick={() => setActiveProfile(person)}
            >
              <div className="lb-card-photo-wrap">
                {person.image_url
                  ? <img src={person.image_url} alt={person.name} className="lb-card-photo" />
                  : <div className="lb-card-avatar">{person.name?.[0]}</div>
                }
                <div className="lb-card-badge">✓</div>
              </div>
              <div className="lb-card-info">
                <div className="lb-card-name">{person.name}</div>
                {person.occupation && <div className="lb-card-occupation">{person.occupation}</div>}
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
  )
}
