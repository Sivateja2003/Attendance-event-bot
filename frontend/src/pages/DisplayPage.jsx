import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { API_BASE, WS_BASE, apiFetch } from '../config'
import UserAvatar from '../components/UserAvatar'

const WS_URL = `${WS_BASE}/ws/display`
const REFRESH_MS = 5000
const SEARCH_API = 'http://13.126.130.56:8003'

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
      <div className="dp-brand">Attend</div>
      {eventName && <div className="dp-idle-event">{eventName}</div>}
      <Clock />
      <div className="dp-idle-sub">
        {connected ? 'Live attendance display' : 'Connecting to server…'}
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
            <DetailRow label="Email"       value={user.email} />
            <DetailRow label="Phone"       value={user.phone} />
            <DetailRow label="Occupation"  value={user.occupation} />
            <DetailRow label="Company"     value={user.company} />
            <DetailRow label="LinkedIn"    value={user.linkedin} />
            <DetailRow label="About"       value={user.business_description} />
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

/* ── Local search (fallback) ───────────────────────────────────── */
const SYNONYMS = {
  ai:         ['artificial intelligence', 'machine learning', 'deep learning', 'neural', 'nlp', 'llm', 'generative'],
  ml:         ['machine learning', 'data science', 'deep learning', 'artificial intelligence', 'neural'],
  cyber:      ['security', 'cybersecurity', 'infosec', 'penetration', 'ethical hacking', 'soc', 'vulnerability'],
  security:   ['cybersecurity', 'infosec', 'penetration testing', 'ethical hacking', 'firewall', 'soc'],
  data:       ['analytics', 'analysis', 'scientist', 'engineer', 'warehouse', 'pipeline', 'bi', 'intelligence'],
  devops:     ['sre', 'platform', 'infrastructure', 'cloud', 'kubernetes', 'docker', 'reliability'],
  cloud:      ['aws', 'azure', 'gcp', 'infrastructure', 'devops', 'terraform', 'serverless'],
  frontend:   ['react', 'vue', 'angular', 'ui', 'ux', 'web', 'javascript', 'typescript', 'css'],
  backend:    ['api', 'server', 'node', 'python', 'java', 'golang', 'microservices', 'django', 'spring'],
  fullstack:  ['full stack', 'fullstack', 'mern', 'mean', 'frontend', 'backend'],
  mobile:     ['ios', 'android', 'flutter', 'react native', 'swift', 'kotlin', 'app'],
  product:    ['product manager', 'product owner', 'pm', 'agile', 'scrum', 'roadmap'],
  design:     ['ux', 'ui', 'figma', 'user experience', 'user interface', 'designer', 'creative'],
  blockchain: ['web3', 'crypto', 'ethereum', 'solidity', 'nft', 'defi', 'smart contract'],
  research:   ['phd', 'scientist', 'researcher', 'academic', 'lab', 'publication'],
  manager:    ['lead', 'head', 'director', 'vp', 'chief', 'cto', 'ceo', 'engineering manager'],
  embedded:   ['firmware', 'iot', 'rtos', 'hardware', 'microcontroller', 'arduino', 'raspberry'],
  game:       ['unity', 'unreal', 'game developer', 'gamedev', '3d', 'graphics'],
}

function _norm(t) { return t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim() }

function _expandTokens(query) {
  const tokens = new Set(_norm(query).split(/\s+/).filter(Boolean))
  for (const tok of [...tokens]) {
    const syns = SYNONYMS[tok] || []
    for (const s of syns) _norm(s).split(/\s+/).filter(Boolean).forEach(w => tokens.add(w))
  }
  return tokens
}

function _scoreParticipant(p, query, tokens) {
  const fields = []
  if (p.occupation) fields.push({ text: _norm(p.occupation), w: 4, label: p.occupation })
  if (p.business_description) fields.push({ text: _norm(p.business_description), w: 3, label: 'business description' })
  if (p.company) fields.push({ text: _norm(p.company), w: 3, label: p.company })
  if (p.linkedin) {
    const parts = p.linkedin.replace(/\/$/, '').split('/')
    const i = parts.indexOf('in')
    if (i >= 0 && i + 1 < parts.length) {
      const handle = _norm(parts[i + 1].replace(/-/g, ' '))
      if (handle) fields.push({ text: handle, w: 3, label: 'LinkedIn profile' })
    }
  }
  if (p.email?.includes('@')) {
    fields.push({ text: _norm(p.email.split('@')[1].split('.')[0]), w: 1, label: 'email domain' })
  }

  let score = 0
  const hits = new Set()
  for (const tok of tokens) {
    for (const f of fields) {
      if (f.text.includes(tok) && !hits.has(f.label)) { score += f.w; hits.add(f.label) }
    }
  }
  const qn = _norm(query)
  if (fields.some(f => f.text.includes(qn))) score += 3

  const max = tokens.size * 4 + 3
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 150)) : 0

  let reason = ''
  if (hits.size > 0) {
    const [first, ...rest] = [...hits]
    reason = first === 'LinkedIn profile' ? 'Found in LinkedIn profile keywords'
           : first === 'email domain'     ? 'Matched via email domain'
           : first === 'business description' ? 'Matched in business description'
           : `Occupation: ${first}`
    if (rest.length) reason += ` · ${rest.length} more signal${rest.length > 1 ? 's' : ''}`
  }
  return { score: pct, reason }
}

function searchLocally(participants, query) {
  if (!query.trim()) return []
  const tokens = _expandTokens(query)
  return participants
    .map(p => { const { score, reason } = _scoreParticipant(p, query, tokens); return { ...p, score, reason } })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
}

/* ── Remote search engine (semantic vector search over attendees) ─ */
async function searchRemote(query, signal) {
  const url = `${SEARCH_API}/search?q=${encodeURIComponent(query)}&limit=50`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search API ${res.status}`)
  const data = await res.json()
  // data.results = [{ id, full_name, role, organization, experience_level, detailed_profile, linkedin_url, score }]
  return data.results || []
}

/* Push our locally-registered participants into the search index so
   they show up in semantic search results. Best-effort, non-blocking. */
async function bulkIndexParticipants(participants) {
  const payload = participants
    .filter(p => p.name)
    .map(p => ({
      id: String(p.id),
      full_name: p.name,
      email: p.email || `attendee-${p.id}@local.invalid`,
      phone: p.phone || null,
      organization: p.company || p.occupation || 'Independent',
      role: p.occupation || (p.company ? 'Team member' : 'Attendee'),
      detailed_profile: p.business_description || null,
      linkedin_url: p.linkedin || null,
    }))
  if (!payload.length) return
  try {
    await fetch(`${SEARCH_API}/attendees/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    /* best-effort */
  }
}

/* Map a remote search result onto our participant shape. If the
   remote id matches one of our local participants, enrich with the
   local fields (photo, phone, etc.). Otherwise render the remote
   attendee as-is so it's still useful. */
function mergeRemoteResult(r, localById) {
  const local = localById.get(String(r.id))
  const score = Math.round((r.score || 0) * 100)
  const reason = [r.experience_level, r.organization].filter(Boolean).join(' · ') || 'Semantic match'
  if (local) return { ...local, score, reason, _remote: true }
  return {
    id: r.id,
    name: r.full_name,
    occupation: r.role,
    company: r.organization,
    business_description: r.detailed_profile,
    linkedin: r.linkedin_url,
    score,
    reason,
    _remote: true,
    _experience: r.experience_level,
  }
}

/* ── Participant detail modal ──────────────────────────────────── */
function ParticipantDetailModal({ person, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!person) return null
  const p = person
  return (
    <div className="dp-modal-overlay" onClick={onClose}>
      <div className="dp-modal" onClick={e => e.stopPropagation()}>
        <button className="dp-modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="dp-modal-body">
          <div className="dp-modal-left">
            <UserAvatar src={p.image_url} name={p.name} imgClass="dp-modal-img" fallbackClass="dp-modal-img-fallback" apiBase={API_BASE}>
              {p.name?.[0]?.toUpperCase()}
            </UserAvatar>
            <div className="dp-modal-name">{p.name}</div>
            {p.company && <div className="dp-modal-company">{p.company}</div>}
            {p.occupation && <div className="dp-modal-occ">{p.occupation}</div>}
            <div className="dp-badge dp-badge--present dp-modal-badge">✓ Checked In</div>
          </div>

          <div className="dp-modal-right">
            <div className="dp-modal-details">
              {p.email    && <div className="dp-modal-row"><span className="dp-modal-icon">✉</span><span>{p.email}</span></div>}
              {p.phone    && <div className="dp-modal-row"><span className="dp-modal-icon">📞</span><span>{p.phone}</span></div>}
              {p.linkedin && (
                <div className="dp-modal-row">
                  <span className="dp-modal-icon">🔗</span>
                  <a href={p.linkedin} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', color: 'inherit' }}>{p.linkedin}</a>
                </div>
              )}
              {p.industry && <div className="dp-modal-row"><span className="dp-modal-icon">🏷</span><span>{p.industry}</span></div>}
              {p.website  && (
                <div className="dp-modal-row">
                  <span className="dp-modal-icon">🌐</span>
                  <a href={p.website} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', color: 'inherit' }}>{p.website}</a>
                </div>
              )}
              {p.checked_in_at && (
                <div className="dp-modal-row">
                  <span className="dp-modal-icon">🕐</span>
                  <span>{new Date(p.checked_in_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {p.business_description && (
          <div className="dp-modal-bio dp-modal-business">
            <div className="dp-modal-bio-label">Company description</div>
            <div className="dp-modal-bio-text">{p.business_description}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Participants directory (single-page grid) ─────────────────── */
function ParticipantsDirectory({ participants, eventName, onBack, onSelect }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState(null)   // null = no search; array (sorted) when active
  const [searchState, setState]   = useState('idle') // idle | loading | error | done
  const [errorMsg, setErrorMsg]   = useState('')
  const debounceRef = useRef(null)
  const abortRef    = useRef(null)

  /* Push current participants into the remote search index once on mount
     (and whenever the participant list changes substantially) so they
     can appear in semantic search results. */
  const indexedRef = useRef(0)
  useEffect(() => {
    if (participants.length && participants.length !== indexedRef.current) {
      indexedRef.current = participants.length
      bulkIndexParticipants(participants)
    }
  }, [participants])

  /* Debounced remote search with local fallback */
  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      setState('idle')
      setErrorMsg('')
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setState('loading')
      setErrorMsg('')
      try {
        const remote = await searchRemote(query, ctrl.signal)
        const byId = new Map(participants.map(p => [String(p.id), p]))
        const merged = remote.map(r => mergeRemoteResult(r, byId))
        setResults(merged)
        setState('done')
      } catch (err) {
        if (err.name === 'AbortError') return
        const local = searchLocally(participants, query)
        setResults(local)
        setState('error')
        setErrorMsg(err.message || 'Search engine unreachable — using local results')
      }
    }, 280)
    return () => clearTimeout(debounceRef.current)
  }, [query, participants])

  /* What to render in the grid */
  const display = results !== null ? results : participants

  return (
    <div className="dp-directory">
      <button className="dp-back-btn" onClick={onBack}>← Back</button>

      <div className="dp-dir-inner">
        <div className="dp-dir-header">
          <h1 className="dp-dir-title">Event directory</h1>
          <p className="dp-dir-sub">
            {participants.length} {participants.length === 1 ? 'person' : 'people'} registered.
            {' '}Type a query to search.
            {eventName && <span className="dp-dir-event">◆ {eventName}</span>}
          </p>
        </div>

        <div className="dp-dir-controls">
          <div className="dp-dir-search-wrap">
            <input
              className="dp-dir-search-input"
              placeholder='Search… e.g. "ML engineers in healthcare"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
            {searchState === 'loading' && <span className="dp-dir-spinner" />}
            {query && (
              <button className="dp-dir-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
            )}
          </div>
        </div>

        {searchState === 'error' && (
          <div className="dp-dir-warn">⚠ {errorMsg}</div>
        )}

        {display.length === 0 ? (
          <div className="dp-dir-empty">
            {query
              ? <>No participants found for "<strong>{query}</strong>"</>
              : 'No participants registered yet.'}
          </div>
        ) : (
          <div className="dp-dir-grid">
            {display.map(p => (
              <button
                key={p.id}
                className="dp-dir-card"
                onClick={() => onSelect(p)}
              >
                <div className="dp-dir-card-top">
                  <UserAvatar
                    src={p.image_url}
                    name={p.name}
                    imgClass="dp-dir-card-photo"
                    fallbackClass="dp-dir-card-avatar"
                    apiBase={API_BASE}
                  >
                    {(p.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                  </UserAvatar>
                  <div className="dp-dir-card-body">
                    <div className="dp-dir-card-name">{p.name}</div>
                    {p.company && <div className="dp-dir-card-company">{p.company}</div>}
                    {typeof p.score === 'number' && p.score > 0 && (
                      <div className="dp-dir-card-reason">
                        ✦ {p.reason || 'Matched'} · {p.score}%
                      </div>
                    )}
                  </div>
                </div>
                {p.linkedin && (
                  <a
                    className="dp-dir-card-linkedin"
                    href={p.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                  >
                    🔗 {p.linkedin}
                  </a>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Confetti burst ─────────────────────────────────────────────── */
function fireConfetti() {
  const opts = { particleCount: 80, spread: 70, startVelocity: 45, ticks: 200 }
  confetti({ ...opts, origin: { x: 0.2, y: 0.6 } })
  confetti({ ...opts, origin: { x: 0.8, y: 0.6 } })
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
  const [selected, setSelected]         = useState(null)
  const [partLoading, setPartLoading]   = useState(false)
  const [popup, setPopup]               = useState(null)

  const popupQueue     = useRef([])
  const popupShowing   = useRef(false)
  const popupTimer     = useRef(null)
  const idleTimer      = useRef(null)
  const scanQueue      = useRef([])
  const isDisplaying   = useRef(false)
  const displayTimer   = useRef(null)
  const showNextRef    = useRef(null)
  const showNextPopupRef = useRef(null)

  const IDLE_TIMEOUT_MS  = 60 * 60 * 1000 // 1 hour
  const DISPLAY_MIN_MS   = 2000

  showNextRef.current = function showNext() {
    if (scanQueue.current.length === 0) {
      isDisplaying.current = false
      return
    }
    isDisplaying.current = true
    const next = scanQueue.current.shift()
    setPerson(next)
    setView('main')
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setPerson(null), IDLE_TIMEOUT_MS)
    displayTimer.current = setTimeout(() => showNextRef.current(), DISPLAY_MIN_MS)
  }

  const POPUP_DURATION_MS = 3000
  showNextPopupRef.current = function showNextPopup() {
    if (popupQueue.current.length === 0) {
      popupShowing.current = false
      setPopup(null)
      return
    }
    popupShowing.current = true
    setPopup(popupQueue.current.shift())
    popupTimer.current = setTimeout(() => showNextPopupRef.current(), POPUP_DURATION_MS)
  }

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

  /* ── WebSocket ── */
  useEffect(() => {
    let reconnectTimer

    function connect() {
      const ws = new WebSocket(WS_URL)
      ws.onopen  = () => setConnected(true)
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (numericEventId !== null && data.event_id !== numericEventId) return

        playCheckInSound()
        fireConfetti()

        popupQueue.current.push(data)
        if (!popupShowing.current) {
          showNextPopupRef.current()
        }

        scanQueue.current.push(data)
        if (!isDisplaying.current) {
          showNextRef.current()
        }
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
      clearTimeout(displayTimer.current)
    }
  }, [numericEventId])

  if (eventNotFound) {
    return (
      <div className="dp-page">
        <div className="dp-idle">
          <div className="dp-brand">Attend</div>
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
    <div className="dp-page">
      {view === 'main' ? (
        <div className="dp-face dp-face--front" style={{ position: 'relative', width: '100%', height: '100%' }}>
          {person ? <PersonCard data={person} /> : <IdleScreen connected={connected} eventName={eventName} />}
          <button
            className="dp-open-participants-btn"
            onClick={() => { setView('profiles'); loadParticipants() }}
          >
            Open Participants
          </button>
        </div>
      ) : (
        <div className="dp-face dp-face--back" style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'auto', transform: 'none', background: 'var(--bg)' }}>
          {partLoading && participants.length === 0 ? (
            <div className="dp-part-loading">Loading participants…</div>
          ) : (
            <ParticipantsDirectory
              participants={participants}
              eventName={eventName}
              onBack={() => setView('main')}
              onSelect={(p) => setSelected(p)}
            />
          )}
          {selected && (
            <ParticipantDetailModal person={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}

      {popup && <ScanPopup data={popup} />}
    </div>
  )
}
