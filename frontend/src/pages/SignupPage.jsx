import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import { useAuth } from '../auth'

export default function SignupPage() {
  const webcamRef = useRef(null)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '', linkedin: '', occupation: '' })
  const [tab, setTab] = useState('upload')
  const [preview, setPreview] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [captured, setCaptured] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')

  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => setEvents(data))
      .catch(() => {})
  }, [])

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
    if (!form.password) return showStatus('error', 'Password is required.')
    if (form.password.length < 6) return showStatus('error', 'Password must be at least 6 characters.')
    if (form.password !== form.confirmPassword) return showStatus('error', 'Passwords do not match.')
    if (!uploadFile && !captured) return showStatus('error', 'Please provide a face photo.')

    setSubmitting(true)
    setStatus(null)

    const fd = new FormData()
    fd.append('name', form.name.trim())
    fd.append('email', form.email.trim())
    fd.append('password', form.password)
    if (form.phone.trim()) fd.append('phone', form.phone.trim())
    if (form.linkedin.trim()) fd.append('linkedin', form.linkedin.trim())
    if (form.occupation.trim()) fd.append('occupation', form.occupation.trim())
    if (selectedEvent) fd.append('event_id', selectedEvent)
    if (uploadFile) fd.append('image', uploadFile)
    else fd.append('image_base64', captured)

    try {
      const res = await fetch('/api/auth/signup', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        showStatus('error', data.detail || 'Registration failed.')
      } else {
        setUser(data)
        navigate('/my', { replace: true })
      }
    } catch {
      showStatus('error', 'Network error. Make sure the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sr-page">
      <div className="sr-card">
        <div className="sr-header">
          <h1 className="sr-title">Create Account</h1>
          <p className="sr-sub">Fill in your details, choose your event, and capture your face to register.</p>
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

          {/* Password + Confirm */}
          <div className="sr-row">
            <div className="sr-field">
              <label>Password <span className="req">*</span></label>
              <input name="password" type="password" placeholder="Min. 6 characters" value={form.password}
                onChange={handleField} disabled={submitting} />
            </div>
            <div className="sr-field">
              <label>Confirm Password <span className="req">*</span></label>
              <input name="confirmPassword" type="password" placeholder="Re-enter password" value={form.confirmPassword}
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

          {/* Event */}
          <div className="sr-field">
            <label>Event (optional)</label>
            <select
              value={selectedEvent}
              onChange={e => setSelectedEvent(e.target.value)}
              disabled={submitting}
              className="sr-select"
            >
              <option value="">— Select an event to register for —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <span className="sr-hint">You can register without selecting an event.</span>
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
                  <input type="file" accept="image/*" id="su-file" className="sr-hidden"
                    onChange={handleFileChange} disabled={submitting} />
                  {!preview ? (
                    <label htmlFor="su-file" className="sr-drop">
                      <div className="sr-drop-icon">+</div>
                      <span>Click to upload a photo</span>
                      <span className="sr-drop-hint">JPG, PNG — clear front-facing face</span>
                    </label>
                  ) : (
                    <div className="sr-preview-wrap">
                      <img src={preview} alt="preview" className="sr-preview" />
                      <label htmlFor="su-file" className="sr-retake">Change Photo</label>
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

          <button type="submit" className="sr-submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="login-footer" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account?{' '}
          <Link to="/login" className="login-link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
