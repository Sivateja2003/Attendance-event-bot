import { useState, useEffect } from 'react'
import { apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

export default function UsersPage() {
  const [allUsers, setAllUsers]   = useState([])
  const [events, setEvents]       = useState([])
  const [eventUsers, setEventUsers] = useState({})   // { [eventId]: [...] }
  const [activeTab, setActiveTab] = useState('all')  // 'all' | eventId
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [search, setSearch]       = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [usersRes, eventsRes] = await Promise.all([
        apiFetch('/api/register/users'),
        apiFetch('/api/events'),
      ])
      const [users, evs] = await Promise.all([usersRes.json(), eventsRes.json()])
      setAllUsers(users)
      setEvents(evs)

      const perEvent = {}
      await Promise.all(evs.map(async ev => {
        try {
          const r = await apiFetch(`/api/events/${ev.id}/users`)
          perEvent[ev.id] = await r.json()
        } catch {
          perEvent[ev.id] = []
        }
      }))
      setEventUsers(perEvent)
    } catch {
      // only wipe users if the main users fetch itself failed
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete "${user.name}"? This will also remove their attendance records and photo. This cannot be undone.`)) return
    setDeleting(user.id)
    try {
      await apiFetch(`/api/register/users/${user.id}`, { method: 'DELETE' })
      setAllUsers(u => u.filter(x => x.id !== user.id))
      setEventUsers(prev => {
        const updated = { ...prev }
        for (const eid in updated) updated[eid] = updated[eid].filter(x => x.id !== user.id)
        return updated
      })
      if (expanded === user.id) setExpanded(null)
    } catch {
      alert('Failed to delete user.')
    } finally {
      setDeleting(null)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id)
  }

  const displayUsers = activeTab === 'all'
    ? allUsers
    : (eventUsers[activeTab] || [])

  const filtered = displayUsers.filter(u =>
    !search.trim() ||
    [u.occupation, u.description]
      .some(v => v?.toLowerCase()?.includes(search.toLowerCase()))
  )

  const totalForTab = activeTab === 'all' ? allUsers.length : (eventUsers[activeTab]?.length ?? 0)

  return (
    <div className="ul-page">
      <div className="ul-container">

        {/* Header */}
        <div className="ul-header">
          <div>
            <h1 className="ul-title">
              Registered Users
              <span className="ul-count">{totalForTab}</span>
            </h1>
            <p className="ul-sub">Click a card to see full details or delete a user.</p>
          </div>
          <button className="change-btn" onClick={fetchAll} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Event tabs */}
        <div className="ul-tabs">
          <button
            className={`ul-tab ${activeTab === 'all' ? 'ul-tab--active' : ''}`}
            onClick={() => { setActiveTab('all'); setExpanded(null) }}
          >
            All Users
            <span className="ul-tab-count">{allUsers.length}</span>
          </button>
          {events.map(ev => (
            <button
              key={ev.id}
              className={`ul-tab ${activeTab === ev.id ? 'ul-tab--active' : ''}`}
              onClick={() => { setActiveTab(ev.id); setExpanded(null) }}
            >
              {ev.name}
              <span className="ul-tab-count">{eventUsers[ev.id]?.length ?? '…'}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          className="ul-search"
          placeholder="Search by occupation or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Empty states */}
        {loading && <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading users...</p>}

        {!loading && displayUsers.length === 0 && (
          <div className="ul-empty">
            <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
            <p>{activeTab === 'all' ? 'No users registered yet.' : 'No users enrolled in this event.'}</p>
          </div>
        )}

        {!loading && displayUsers.length > 0 && filtered.length === 0 && (
          <div className="ul-empty">
            <p>No users match "<strong>{search}</strong>"</p>
          </div>
        )}

        {/* User list */}
        {!loading && filtered.length > 0 && (
          <div className="users-list">
            {filtered.map(user => (
              <div key={user.id} className="user-card">

                <div className="user-card-header" onClick={() => toggleExpand(user.id)}>
                  <UserAvatar src={user.image_url} name={user.name} imgClass="user-thumb" fallbackClass="user-thumb-placeholder">👤</UserAvatar>
                  <div className="user-info">
                    <div className="user-name">
                      {user.name}
                      {user.status && (
                        <span className={`ul-status-badge ul-status-${user.status}`}>
                          {user.status === 'present' ? '✓ Checked In' : 'Enrolled'}
                        </span>
                      )}
                    </div>
                    <div className="user-date">
                      {user.email || 'No email'}
                      {user.registered_at && (
                        <> · Registered {new Date(user.registered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                      )}
                    </div>
                  </div>
                  <span className="user-chevron">{expanded === user.id ? '▲' : '▼'}</span>
                </div>

                {expanded === user.id && (
                  <div className="user-details">
                    {user.email && (
                      <div className="detail-row">
                        <span className="detail-icon">✉</span>
                        <span>{user.email}</span>
                      </div>
                    )}
                    {user.phone && (
                      <div className="detail-row">
                        <span className="detail-icon">📞</span>
                        <span>{user.phone}</span>
                      </div>
                    )}
                    {user.occupation && (
                      <div className="detail-row">
                        <span className="detail-icon">💼</span>
                        <span>{user.occupation}</span>
                      </div>
                    )}
                    {user.linkedin && (
                      <div className="detail-row">
                        <span className="detail-icon">🔗</span>
                        <a
                          href={user.linkedin.startsWith('http') ? user.linkedin : `https://${user.linkedin}`}
                          target="_blank"
                          rel="noreferrer"
                          className="detail-link"
                          onClick={e => e.stopPropagation()}
                        >
                          LinkedIn Profile
                        </a>
                      </div>
                    )}

                    {!user.email && !user.phone && !user.occupation && !user.linkedin && (
                      <p className="muted" style={{ fontSize: 13 }}>No additional details on record.</p>
                    )}

                    {user.role !== 'admin' && (
                      <button
                        className="btn-delete-full"
                        disabled={deleting === user.id}
                        onClick={e => { e.stopPropagation(); handleDelete(user) }}
                      >
                        {deleting === user.id ? 'Deleting...' : '✕ Delete User'}
                      </button>
                    )}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
