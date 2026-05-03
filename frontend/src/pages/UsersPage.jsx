import { useState, useEffect } from 'react'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/register/users')
      setUsers(await res.json())
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete "${user.name}"? This will also remove their attendance records and photo. This cannot be undone.`)) return
    setDeleting(user.id)
    try {
      await fetch(`/api/register/users/${user.id}`, { method: 'DELETE' })
      setUsers(u => u.filter(x => x.id !== user.id))
      if (expanded === user.id) setExpanded(null)
    } catch {
      alert('Failed to delete user. Make sure the backend is running.')
    } finally {
      setDeleting(null)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id)
  }

  const filtered = users.filter(u =>
    [u.name, u.email, u.occupation, u.phone]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="ul-page">
      <div className="ul-container">

        {/* Header */}
        <div className="ul-header">
          <div>
            <h1 className="ul-title">
              Registered Users
              <span className="ul-count">{users.length}</span>
            </h1>
            <p className="ul-sub">Click a card to see full details or delete a user.</p>
          </div>
          <button className="change-btn" onClick={fetchUsers} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Search */}
        <input
          className="ul-search"
          placeholder="Search by name, email, occupation or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Empty states */}
        {loading && <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading users...</p>}

        {!loading && users.length === 0 && (
          <div className="ul-empty">
            <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
            <p>No users registered yet.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Go to Spotregister to add your first user.</p>
          </div>
        )}

        {!loading && users.length > 0 && filtered.length === 0 && (
          <div className="ul-empty">
            <p>No users match "<strong>{search}</strong>"</p>
          </div>
        )}

        {/* User list */}
        {!loading && filtered.length > 0 && (
          <div className="users-list">
            {filtered.map(user => (
              <div key={user.id} className="user-card">

                {/* Card header — click to expand */}
                <div className="user-card-header" onClick={() => toggleExpand(user.id)}>
                  {user.image_url
                    ? <img src={user.image_url} alt={user.name} className="user-thumb" />
                    : <div className="user-thumb-placeholder">👤</div>
                  }
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-date">
                      {user.email || 'No email'}
                      {user.registered_at && (
                        <> · Registered {new Date(user.registered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                      )}
                    </div>
                  </div>
                  <span className="user-chevron">{expanded === user.id ? '▲' : '▼'}</span>
                </div>

                {/* Expanded details */}
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
