import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
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

/* ── Client-side participant search ────────────────────────────── */
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
  // exact phrase bonus
  const qn = _norm(query)
  if (fields.some(f => f.text.includes(qn))) score += 3

  const max = tokens.size * 4 + 3
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 150)) : 0

  let reason = ''
  if (hits.size > 0) {
    const [first, ...rest] = [...hits]
    reason = first === 'LinkedIn profile' ? 'Found in LinkedIn profile keywords'
           : first === 'email domain'     ? 'Matched via email domain'
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

function ParticipantSearch({ participants, onClose, onSelect }) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const inputRef  = useRef(null)
  const timerRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const runSearch = (q) => {
    setResults(searchLocally(participants, q))
  }

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(val), 120)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
  }

  const HINTS = ['Cyber Security', 'Data Scientist', 'AI Engineer', 'Product Manager', 'Full Stack Developer', 'DevOps', 'Mobile Developer', 'Designer']

  return (
    <div className="dp-search-overlay">
      <div className="dp-search-header">
        <button className="dp-search-back" onClick={onClose}>← Back</button>
        <div className="dp-search-input-wrap">
          <span className="dp-search-icon-prefix">🔍</span>
          <input
            ref={inputRef}
            className="dp-search-input"
            placeholder="Search by role, skill or field…"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button className="dp-search-clear"
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}>✕</button>
          )}
        </div>
      </div>

      <div className="dp-search-body">
        {!query && (
          <div className="dp-search-hints">
            <div className="dp-search-hints-label">Try searching for:</div>
            <div className="dp-search-hint-chips">
              {HINTS.map(h => (
                <button key={h} className="dp-search-hint-chip"
                  onClick={() => { setQuery(h); runSearch(h) }}>{h}</button>
              ))}
            </div>
          </div>
        )}
        {query && results.length === 0 && (
          <div className="dp-search-state">No participants found for "<strong>{query}</strong>"</div>
        )}
        {results.length > 0 && (
          <div className="dp-search-results">
            <div className="dp-search-count">{results.length} match{results.length !== 1 ? 'es' : ''} found</div>
            {results.map(p => (
              <div key={p.id} className="dp-search-card" onClick={() => onSelect(p)}>
                <UserAvatar src={p.image_url} name={p.name}
                  imgClass="dp-search-photo" fallbackClass="dp-search-avatar" apiBase={API_BASE}>
                  {p.name?.[0]?.toUpperCase()}
                </UserAvatar>
                <div className="dp-search-card-body">
                  <div className="dp-search-card-name">{p.name}</div>
                  {p.occupation && <div className="dp-search-card-occ">{p.occupation}</div>}
                  {p.reason && <div className="dp-search-card-reason">✦ {p.reason}</div>}
                </div>
                <div className="dp-search-card-score">{p.score}%</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Single participant profile ─────────────────────────────────── */
function ParticipantProfile({ person, index, total, eventName, onBack, onPrev, onNext, onSearch }) {
  const [prevSnap, setPrevSnap]     = useState(null)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipDir, setFlipDir]       = useState(null)

  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const flatLayerRef = useRef(null)   // old page: stationary clipped half
  const turnWrapRef  = useRef(null)   // old page: rotating half (wrapper)
  const turnInnerRef = useRef(null)   // old page: rotating half (full-width inner)
  const animRef      = useRef(null)
  const prevPersonRef = useRef(person)
  const prevIndexRef  = useRef(index)
  const flipDirRef    = useRef(null)
  const firstRender   = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      prevPersonRef.current = person
      prevIndexRef.current  = index
      return
    }
    if (prevIndexRef.current !== index && flipDirRef.current) {
      const dir = flipDirRef.current
      flipDirRef.current = null
      setPrevSnap({ person: prevPersonRef.current, index: prevIndexRef.current })
      setFlipDir(dir)
      setIsFlipping(true)
      startFlip(dir)
    }
    prevPersonRef.current = person
    prevIndexRef.current  = index
  }, [person, index])

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  const startFlip = (dir) => {
    let t0 = null
    const DURATION = 600

    const tick = (ts) => {
      if (!t0) t0 = ts
      const raw = Math.min((ts - t0) / DURATION, 1)
      const t   = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2

      updateFrame(t, dir)

      if (raw < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        const cv = canvasRef.current
        if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height)
        setIsFlipping(false)
        setPrevSnap(null)
        setFlipDir(null)
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }

  const updateFrame = (t, dir) => {
    const root = containerRef.current
    if (!root) return
    const W = root.offsetWidth
    const H = root.offsetHeight

    /* Fold line sweeps across: next = right→left, prev = left→right */
    const foldX = dir === 'next' ? W * (1 - t) : W * t
    /* Turning half grows from 0 to full width over the animation */
    const turnW = dir === 'next' ? W - foldX : foldX
    /* Rotation: 0° (flat) → 90° (edge-on, invisible) */
    const angle = t * 90

    /* ── Flat half: straight clip, no wave ── */
    if (flatLayerRef.current) {
      flatLayerRef.current.style.clipPath = dir === 'next'
        ? `inset(0 ${Math.round(W - foldX)}px 0 0)`
        : `inset(0 0 0 ${Math.round(foldX)}px)`
    }

    /* ── Turning half: CSS 3D rotation showing actual old content ── */
    if (turnWrapRef.current) {
      const el = turnWrapRef.current
      if (dir === 'next') {
        /* Pivot at left edge of wrapper = fold line; right side lifts toward viewer */
        el.style.left            = `${foldX}px`
        el.style.width           = `${turnW}px`
        el.style.transformOrigin = 'left center'
        el.style.transform       = `perspective(1200px) rotateY(${-angle}deg)`
      } else {
        /* Pivot at right edge of wrapper = fold line; left side lifts toward viewer */
        el.style.left            = '0px'
        el.style.width           = `${turnW}px`
        el.style.transformOrigin = 'right center'
        el.style.transform       = `perspective(1200px) rotateY(${angle}deg)`
      }
    }
    if (turnInnerRef.current) {
      /* Inner div is full page width; overflow:hidden on wrapper clips it */
      turnInnerRef.current.style.left  = dir === 'next' ? `-${foldX}px` : '0px'
      turnInnerRef.current.style.width = `${W}px`
    }

    /* ── Canvas: shadow ahead of fold + crease highlight only ── */
    const cv = canvasRef.current
    if (!cv) return
    cv.width  = W
    cv.height = H
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    /* Shadow cast onto the newly revealed new page */
    const shadowW = W * 0.055
    ctx.save()
    if (dir === 'next') {
      const sg = ctx.createLinearGradient(Math.max(0, foldX - shadowW), 0, foldX, 0)
      sg.addColorStop(0, 'rgba(0,0,0,0)')
      sg.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = sg
      ctx.fillRect(Math.max(0, foldX - shadowW), 0, Math.min(shadowW, foldX), H)
    } else {
      const sg = ctx.createLinearGradient(foldX, 0, Math.min(W, foldX + shadowW), 0)
      sg.addColorStop(0, 'rgba(0,0,0,0.55)')
      sg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sg
      ctx.fillRect(foldX, 0, Math.min(shadowW, W - foldX), H)
    }
    ctx.restore()

    /* Fold crease — sharp bright vertical line */
    ctx.save()
    ctx.strokeStyle = 'rgba(220,210,255,0.95)'
    ctx.lineWidth   = 1.5
    ctx.shadowColor = 'rgba(180,160,255,0.5)'
    ctx.shadowBlur  = 5
    ctx.beginPath()
    ctx.moveTo(foldX, 0)
    ctx.lineTo(foldX, H)
    ctx.stroke()
    ctx.restore()
  }

  const handleNextClick = () => {
    if (isFlipping || index >= total - 1) return
    flipDirRef.current = 'next'
    onNext()
  }

  const handlePrevClick = () => {
    if (isFlipping) return
    if (index === 0) { onBack(); return }
    flipDirRef.current = 'prev'
    onPrev()
  }

  const renderContent = (p, i) => (
    <>
      <div className="dp-part-photo-side">
        <UserAvatar src={p.image_url} name={p.name} imgClass="dp-part-big-photo" fallbackClass="dp-part-big-avatar" apiBase={API_BASE}>
          {p.name?.[0]?.toUpperCase()}
        </UserAvatar>
      </div>
      <div className="dp-part-info-side">
        <div className="dp-part-profile-name">{p.name}</div>
        <div className="dp-badge dp-badge--present" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>✓ Checked In</div>
        {p.occupation && <div className="dp-part-profile-occupation">{p.occupation}</div>}
        <div className="dp-part-profile-details">
          {p.email    && <div className="dp-part-profile-row"><span className="dp-part-profile-icon">✉</span><span>{p.email}</span></div>}
          {p.phone    && <div className="dp-part-profile-row"><span className="dp-part-profile-icon">📞</span><span>{p.phone}</span></div>}
          {p.linkedin && <div className="dp-part-profile-row"><span className="dp-part-profile-icon">🔗</span><span style={{ wordBreak: 'break-all' }}>{p.linkedin}</span></div>}
          {p.checked_in_at && (
            <div className="dp-part-profile-row">
              <span className="dp-part-profile-icon">🕐</span>
              <span>{new Date(p.checked_in_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>
        {total > 1 && (
          <div className="dp-part-dots">
            {Array.from({ length: Math.min(total, 12) }).map((_, idx) => (
              <div key={idx} className={`dp-part-dot ${idx === i % 12 ? 'active' : ''}`} />
            ))}
            {total > 12 && <span className="dp-part-dots-more">+{total - 12}</span>}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div ref={containerRef} className="dp-part-profile">

      {/* z-index 1 — new page, always visible underneath */}
      <div className="dp-page-layer">
        <button className="dp-back-btn" onClick={onBack}>← Back</button>
        <div className="dp-part-counter">
          {index + 1} / {total}
          {eventName && <span className="dp-part-event-badge">◆ {eventName}</span>}
        </div>
        {person && renderContent(person, index)}
        <div className="dp-part-nav">
          <button className="dp-part-nav-btn" onClick={handlePrevClick} disabled={index === 0 || isFlipping}>← Previous</button>
          <button className="dp-part-nav-btn dp-part-nav-btn--search" onClick={onSearch}>🔍 Search</button>
          <button className="dp-part-nav-btn" onClick={handleNextClick} disabled={index >= total - 1 || isFlipping}>Next →</button>
        </div>
      </div>

      {isFlipping && prevSnap && (<>
        {/* z-index 2 — old page FLAT half: straight inset clip, no wave */}
        <div ref={flatLayerRef} className="dp-page-layer dp-page-old" style={{ pointerEvents: 'none' }}>
          <div className="dp-part-counter">
            {prevSnap.index + 1} / {total}
            {eventName && <span className="dp-part-event-badge">◆ {eventName}</span>}
          </div>
          {renderContent(prevSnap.person, prevSnap.index)}
        </div>

        {/* z-index 3 — old page TURNING half: actual content rotating in 3D */}
        <div
          ref={turnWrapRef}
          style={{
            position: 'absolute', top: 0, height: '100%', zIndex: 3,
            overflow: 'hidden', pointerEvents: 'none',
            backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <div ref={turnInnerRef} style={{ position: 'absolute', top: 0, height: '100%', display: 'flex' }}>
            {renderContent(prevSnap.person, prevSnap.index)}
          </div>
          {/* Darkness gradient: far edge of turning page is most in shadow (page curves away) */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: flipDir === 'next'
              ? 'linear-gradient(to right, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 100%)'
              : 'linear-gradient(to left,  rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 100%)',
          }} />
        </div>
      </>)}

      {/* z-index 4 — canvas: shadow on new page + crease line only */}
      {isFlipping && <canvas ref={canvasRef} className="dp-flip-canvas" />}
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
  const [partIndex, setPartIndex]       = useState(0)
  const [partLoading, setPartLoading]   = useState(false)
  const [searchOpen, setSearchOpen]     = useState(false)
  const [popup, setPopup]               = useState(null)

  const touchStartX    = useRef(0)
  const touchStartY    = useRef(0)
  const mouseStartX    = useRef(null)
  const hasSeenScan    = useRef(false)
  const popupTimer     = useRef(null)
  const idleTimer      = useRef(null)
  const scanQueue      = useRef([])
  const isDisplaying   = useRef(false)
  const displayTimer   = useRef(null)
  const showNextRef    = useRef(null)

  const IDLE_TIMEOUT_MS  = 60 * 60 * 1000 // 1 hour
  const DISPLAY_MIN_MS   = 2000            // min time each person stays on screen

  // Defined via ref so setTimeout inside can always call the latest version
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

        // Confetti + sound on every scan
        playCheckInSound()
        fireConfetti()

        // Popup only after the first scan
        if (hasSeenScan.current) {
          clearTimeout(popupTimer.current)
          setPopup(data)
          popupTimer.current = setTimeout(() => setPopup(null), 4000)
        }
        hasSeenScan.current = true

        // Queue the scan — each person gets at least DISPLAY_MIN_MS on screen
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
                  person={participants[partIndex]}
                  index={partIndex}
                  total={participants.length}
                  eventName={eventName}
                  onBack={() => setView('main')}
                  onPrev={() => { if (partIndex > 0) setPartIndex(i => i - 1); else setView('main') }}
                  onNext={() => { if (partIndex < participants.length - 1) setPartIndex(i => i + 1) }}
                  onSearch={() => setSearchOpen(true)}
                />
              )}

              {searchOpen && (
                <ParticipantSearch
                  participants={participants}
                  onClose={() => setSearchOpen(false)}
                  onSelect={(p) => {
                    const idx = participants.findIndex(x => x.id === p.id)
                    if (idx >= 0) setPartIndex(idx)
                    setSearchOpen(false)
                  }}
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
