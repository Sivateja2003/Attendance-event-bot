import { useRef, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Webcam from 'react-webcam'
import { apiFetch } from '../config'

export default function EventRegisterPage() {
  const { eventId } = useParams()
  const webcamRef = useRef(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '', linkedin: '', occupation: '', description: '' })
  const [tab, setTab] = useState('upload')
  const [preview, setPreview] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [captured, setCaptured] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [eventName, setEventName] = useState(null)
  const [eventNotFound, setEventNotFound] = useState(false)

  useEffect(() => {
    if (!eventId) return
    apiFetch('/api/events')
      .then(r => r.json())
      .then(events => {
        const ev = events.find(e => e.id === Number(eventId))
        if (ev) setEventName(ev.name)
        else setEventNotFound(true)
      })
      .catch(() => {})
  }, [eventId])

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

  function showStatus(type, msg) {
    setStatus(type)
    setStatusMsg(msg)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return showStatus('error', 'Full name is required.')
    if (!form.email.trim()) return showStatus('error', 'Email is required.')
    if (!uploadFile && !captured) return showStatus('error', 'Please provide a face photo.')

    setSubmitting(true)
    setStatus(null)

    const fd = new FormData()
    fd.append('name', form.name.trim())
    fd.append('email', form.email.trim())
    if (form.phone.trim()) fd.append('phone', form.phone.trim())
    if (form.linkedin.trim()) fd.append('linkedin', form.linkedin.trim())
    if (form.occupation.trim()) fd.append('occupation', form.occupation.trim())
    if (form.description.trim()) fd.append('description', form.description.trim())
    fd.append('event_id', eventId)
    if (uploadFile) fd.append('image', uploadFile)
    else fd.append('image_base64', captured)

    try {
      const res = await apiFetch('/api/auth/signup', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        showStatus('error', data.detail || 'Registration failed.')
      } else {
        showStatus('success', `Successfully registered for "${eventName || 'the event'}"! You're all set.`)
        setForm({ name: '', email: '', phone: '', linkedin: '', occupation: '', description: '' })
        setPreview(null)
        setUploadFile(null)
        setCaptured(null)
        setTab('upload')
      }
    } catch {
      showStatus('error', 'Network error. Make sure the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  if (eventNotFound) {
    return (
      <div className="sr-page">
        <div className="sr-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠</div>
          <h2 style={{ marginBottom: 8 }}>Event Not Found</h2>
          <p style={{ color: 'var(--muted, #888)' }}>This event no longer exists. Ask the organiser for the correct registration link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sr-page">
      <div className="sr-card">
        <div className="sr-header">
          <h1 className="sr-title">Register</h1>
          {eventName
            ? <p className="sr-sub">Registering for <strong>{eventName}</strong>. Fill in your details and capture your face photo.</p>
            : <p className="sr-sub">Loading event details…</p>
          }
        </div>

        <form onSubmit={handleSubmit} className="sr-form">

          {/* Name + Email */}
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

          {/* Phone + Occupation */}
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

          {/* LinkedIn */}
          <div className="sr-field">
            <label>LinkedIn Profile URL</label>
            <input name="linkedin" placeholder="https://linkedin.com/in/yourprofile"
              value={form.linkedin} onChange={handleField} disabled={submitting} />
          </div>

          {/* Description */}
          <div className="sr-field">
            <label>Description</label>
            <textarea name="description" placeholder="Brief bio or description…"
              value={form.description} onChange={handleField} disabled={submitting}
              className="sr-textarea" rows={3} />
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
                  <input type="file" accept="image/*" id="er-file" className="sr-hidden"
                    onChange={handleFileChange} disabled={submitting} />
                  {!preview ? (
                    <label htmlFor="er-file" className="sr-drop">
                      <div className="sr-drop-icon">+</div>
                      <span>Click to upload a photo</span>
                      <span className="sr-drop-hint">JPG, PNG — clear front-facing face</span>
                    </label>
                  ) : (
                    <div className="sr-preview-wrap">
                      <img src={preview} alt="preview" className="sr-preview" />
                      <label htmlFor="er-file" className="sr-retake">Change Photo</label>
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

          {status && (
            <div className={`sr-status ${status}`}>{statusMsg}</div>
          )}

          <button type="submit" className="sr-submit" disabled={submitting || !eventName}>
            {submitting ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  )
}
