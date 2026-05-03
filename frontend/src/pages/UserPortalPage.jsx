import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../auth'

export default function UserPortalPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [myEvents, setMyEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeProfile, setActiveProfile] = useState(null)
  const [search, setSearch] = useState('')
  const wsRef = useRef(null)
  const toastTimer = useRef(null)

  /* ── Load own profile ── */
  useEffect(() => {
    fetch('/api/me/profile')
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {})
  }, [])

  /* ── Load enrolled events ── */
  useEffect(() => {
    fetch('/api/me/events')
      .then(r => r.json())
      .then(data => {
        setMyEvents(data)
        if (data.length === 1) setSelectedEvent(data[0])
      })
      .catch(() => {})
  }, [])

  /* ── Fetch attendees for selected event ── */
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

  /* ── WebSocket: arrival notifications ── */
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
          if (
            data.type === 'match' &&
            data.user?.role !== 'admin' &&
            selectedEvent &&
            data.event_name === selectedEvent.name
          ) {
            showToast(data.user)
            fetchAttendees(selectedEvent.id)
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

  function showToast(arrivedUser) {
    setToast(arrivedUser)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  const filtered = attendees.filter(a =>
    [a.name, a.email, a.occupation]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="up-page">

      {/* ── Toast ── */}
      {toast && (
        <div className="lb-toast" onClick={() => setToast(null)}>
          {toast.image_url
            ? <img src={toast.image_url} alt={toast.name} className="lb-toast-photo" />
            : <div className="lb-toast-avatar">{toast.name?.[0]}</div>
          }
          <div className="lb-toast-text">
            <span className="lb-toast-name">{toast.name}</span>
            <span className="lb-toast-msg">just arrived! 🎉</span>
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
              {activeProfile.occupation && <p className="lb-modal-occupation">{activeProfile.occupation}</p>}
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

      {/* ── Your Profile ── */}
      <div className="up-section">
        <h2 className="up-section-title">Your Profile</h2>
        {profile ? (
          <div className="up-profile-card">
            <div className="up-profile-photo-wrap">
              {profile.image_url
                ? <img src={profile.image_url} alt={profile.name} className="up-profile-photo" />
                : <div className="up-profile-avatar">{profile.name?.[0]}</div>
              }
            </div>
            <div className="up-profile-info">
              <h3 className="up-profile-name">{profile.name}</h3>
              {profile.occupation && <p className="up-profile-occupation">{profile.occupation}</p>}
              <div className="up-profile-details">
                {profile.email && (
                  <div className="up-detail-row">
                    <span className="up-detail-icon">✉</span>
                    <a href={`mailto:${profile.email}`} className="lb-modal-link">{profile.email}</a>
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
                      className="lb-modal-link"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="up-loading">Loading profile...</p>
        )}
      </div>

      {/* ── Who's Arrived ── */}
      <div className="up-section">
        <div className="up-arrivals-header">
          <h2 className="up-section-title">Who's Arrived</h2>
          {myEvents.length > 1 && (
            <select
              className="up-event-select"
              value={selectedEvent?.id ?? ''}
              onChange={e => {
                const ev = myEvents.find(x => x.id === Number(e.target.value))
                setSelectedEvent(ev ?? null)
                setAttendees([])
              }}
            >
              <option value="">— Pick an event —</option>
              {myEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}
          {myEvents.length === 1 && selectedEvent && (
            <span className="up-event-badge">{selectedEvent.name}</span>
          )}
        </div>

        {myEvents.length === 0 && (
          <div className="lb-empty">
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <p>You are not enrolled in any event yet.</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Ask the organiser to add you to an event.</p>
          </div>
        )}

        {myEvents.length > 0 && !selectedEvent && (
          <div className="lb-empty">
            <p>Select an event above to see who's arrived.</p>
          </div>
        )}

        {selectedEvent && (
          <>
            <div className="lb-search-wrap">
              <input
                className="lb-search"
                placeholder="Search by name, email or occupation..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="up-count-row">
              <span className="lb-count-pill">
                <span className="lb-count-dot" />
                {attendees.length} checked in
              </span>
            </div>

            {loading && <div className="lb-loading">Loading attendees...</div>}

            {!loading && attendees.length === 0 && (
              <div className="lb-empty">
                <div style={{ fontSize: 52, marginBottom: 12 }}>🚪</div>
                <p>No one has checked in yet.</p>
                <p style={{ fontSize: 13, marginTop: 6 }}>This page updates automatically when people arrive.</p>
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
                  <div key={person.id} className="lb-card" onClick={() => setActiveProfile(person)}>
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
          </>
        )}
      </div>
    </div>
  )
}
