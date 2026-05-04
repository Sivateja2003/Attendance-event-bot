import { useRef, useState, useEffect } from 'react'
import Webcam from 'react-webcam'
import { apiFetch } from '../config'

export default function RegisterPage() {
  const webcamRef = useRef(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', linkedin: '', occupation: '' })
  const [tab, setTab] = useState('upload')
  const [preview, setPreview] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [captured, setCaptured] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null) // null | 'success' | 'error'
  const [statusMsg, setStatusMsg] = useState('')

  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')

  useEffect(() => {
    apiFetch('/api/events')
      .then(r => r.json())
      .then(data => setEvents(data))
      .catch(() => {})
  }, [])

  // Google Sheet import state
  const [sheetUrl, setSheetUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadFile(file)
    setPreview(URL.createObjectURL(file))
    setCaptured(null)
  }

  function handleCapture() {
    const img = webcamRef.current?.getScreenshot()
    if (!img) return
    setCaptured(img)
    setPreview(img)
    setUploadFile(null)
  }

  function switchTab(t) {
    setTab(t)
    setPreview(null)
    setUploadFile(null)
    setCaptured(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return showStatus('error', 'Full name is required.')
    if (!form.email.trim()) return showStatus('error', 'Email is required.')
    if (!selectedEvent) return showStatus('error', 'Please select an event.')
    if (!uploadFile && !captured) return showStatus('error', 'Please provide a face photo.')

    setSubmitting(true)
    setStatus(null)

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v.trim()))
    if (selectedEvent) fd.append('event_id', selectedEvent)
    if (uploadFile) fd.append('image', uploadFile)
    else fd.append('image_base64', captured)

    try {
      const res = await apiFetch('/api/register', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        showStatus('error', data.detail || 'Registration failed.')
      } else {
        const evtMsg = data.event_name ? ` for "${data.event_name}"` : ''
        showStatus('success', `${data.name} registered successfully${evtMsg}!`)
        setForm({ name: '', email: '', phone: '', linkedin: '', occupation: '' })
        setSelectedEvent('')
        setPreview(null)
        setUploadFile(null)
        setCaptured(null)
      }
    } catch {
      showStatus('error', 'Network error. Make sure the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  function showStatus(type, msg) {
    setStatus(type)
    setStatusMsg(msg)
  }

  async function handleImport() {
    if (!sheetUrl.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await apiFetch('/api/import/google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_url: sheetUrl.trim() }),
      })
      const data = await res.json()
      setImportResult(data)
    } catch {
      setImportResult({ success: false, error: 'Network error. Make sure the backend is running.' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="sr-page">
      <div className="sr-card">

        <div className="sr-header">
          <h1 className="sr-title">Spotregister</h1>
          <p className="sr-sub">Fill in the details, select your event, and capture your face. You will be eligible only for the event you register under.</p>
        </div>

        <form onSubmit={handleSubmit} className="sr-form">

          {/* Row 1: Name + Email */}
          <div className="sr-row">
            <div className="sr-field">
              <label>Full Name <span className="req">*</span></label>
              <input name="name" placeholder="John Doe" value={form.name}
                onChange={handleField} disabled={submitting} />
            </div>
            <div className="sr-field">
              <label>Email Address <span className="req">*</span></label>
              <input name="email" type="email" placeholder="john@example.com" value={form.email}
                onChange={handleField} disabled={submitting} />
            </div>
          </div>

          {/* Row 2: Phone + Occupation */}
          <div className="sr-row">
            <div className="sr-field">
              <label>Phone Number</label>
              <input name="phone" placeholder="+91 98765 43210" value={form.phone}
                onChange={handleField} disabled={submitting} />
            </div>
            <div className="sr-field">
              <label>Occupation</label>
              <input name="occupation" placeholder="Software Engineer" value={form.occupation}
                onChange={handleField} disabled={submitting} />
            </div>
          </div>

          {/* LinkedIn full width */}
          <div className="sr-field">
            <label>LinkedIn Profile URL</label>
            <input name="linkedin" placeholder="https://linkedin.com/in/yourprofile"
              value={form.linkedin} onChange={handleField} disabled={submitting} />
          </div>

          {/* Event Name */}
          <div className="sr-field">
            <label>Event Name <span className="req">*</span></label>
            <select
              value={selectedEvent}
              onChange={e => setSelectedEvent(e.target.value)}
              disabled={submitting}
              className="sr-select"
            >
              <option value="">— Select the event you are registering for —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            {events.length === 0
              ? <span className="sr-hint">No events created yet. Ask the organiser to create an event first.</span>
              : <span className="sr-hint">You will only be eligible for the event you select here.</span>
            }
          </div>

          {/* Face photo */}
          <div className="sr-photo-section">
            <label>Face Photo <span className="req">*</span></label>
            <div className="sr-tabs">
              <button type="button" className={tab === 'upload' ? 'active' : ''} onClick={() => switchTab('upload')}>
                Upload Photo
              </button>
              <button type="button" className={tab === 'camera' ? 'active' : ''} onClick={() => switchTab('camera')}>
                Use Camera
              </button>
            </div>

            <div className="sr-photo-area">
              {tab === 'upload' && (
                <>
                  <input type="file" accept="image/*" id="sr-file" className="sr-hidden"
                    onChange={handleFileChange} disabled={submitting} />
                  {!preview ? (
                    <label htmlFor="sr-file" className="sr-drop">
                      <div className="sr-drop-icon">+</div>
                      <span>Click to upload a photo</span>
                      <span className="sr-drop-hint">JPG, PNG — clear front-facing face</span>
                    </label>
                  ) : (
                    <div className="sr-preview-wrap">
                      <img src={preview} alt="preview" className="sr-preview" />
                      <label htmlFor="sr-file" className="sr-retake">Change Photo</label>
                    </div>
                  )}
                </>
              )}

              {tab === 'camera' && (
                <>
                  {!captured ? (
                    <div className="sr-cam-wrap">
                      <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                        screenshotQuality={0.9}
                        videoConstraints={{ width: 400, height: 300, facingMode: 'user' }}
                        className="sr-cam" />
                      <button type="button" className="sr-capture-btn" onClick={handleCapture}>
                        Capture
                      </button>
                    </div>
                  ) : (
                    <div className="sr-preview-wrap">
                      <img src={preview} alt="captured" className="sr-preview" />
                      <button type="button" className="sr-retake"
                        onClick={() => { setCaptured(null); setPreview(null) }}>
                        Retake
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Status message */}
          {status && (
            <div className={`sr-status ${status}`}>{statusMsg}</div>
          )}

          <button type="submit" className="sr-submit" disabled={submitting}>
            {submitting ? 'Registering...' : 'Register'}
          </button>

        </form>
      </div>
      {/* ── Google Sheet Bulk Import ── */}
      <div className="sr-card import-card">
        <div className="sr-header">
          <h1 className="sr-title">Bulk Import from Google Sheet</h1>
          <p className="sr-sub">
            Paste your Google Sheet URL to register everyone at once. The sheet must be shared as
            <strong> "Anyone with the link can view"</strong>.
          </p>
        </div>

        <div className="import-columns-hint">
          Expected column headers (exact, case-insensitive):
          <code>name &nbsp;|&nbsp; gmail &nbsp;|&nbsp; phone no &nbsp;|&nbsp; occupation &nbsp;|&nbsp; linkedin &nbsp;|&nbsp; photo &nbsp;|&nbsp; event name</code>
          <br />
          The <em>photo</em> column should contain a Google Drive sharing link or a direct image URL.
        </div>

        <div className="import-row">
          <input
            className="import-url-input"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
            disabled={importing}
          />
          <button
            className="sr-submit import-btn"
            onClick={handleImport}
            disabled={importing || !sheetUrl.trim()}
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>

        {importing && (
          <div className="import-progress">
            Processing rows — downloading photos and generating face embeddings. This may take a minute...
          </div>
        )}

        {importResult && (
          <div className={`import-result ${importResult.success ? 'success' : 'error'}`}>
            {!importResult.success ? (
              <p>Error: {importResult.error}</p>
            ) : (
              <>
                <p>
                  <strong>✓ {importResult.imported} registered</strong>
                  {importResult.skipped > 0 && <span> &nbsp;·&nbsp; ⚠ {importResult.skipped} skipped</span>}
                </p>
                {importResult.events_created?.length > 0 && (
                  <p>Events created: {importResult.events_created.join(', ')}</p>
                )}
                {importResult.errors?.length > 0 && (
                  <details className="import-errors">
                    <summary>Show skipped ({importResult.errors.length})</summary>
                    <ul>
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
