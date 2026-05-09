import { useState, useEffect } from 'react'
import { useAuth } from '../auth'
import { apiFetch } from '../config'

export default function SettingsPage() {
  const { user } = useAuth()

  const [emailUser, setEmailUser] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailFrom, setEmailFrom] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [removing, setRemoving] = useState(false)

  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState(null)

  useEffect(() => {
    apiFetch('/api/settings/email')
      .then(r => r.json())
      .then(data => {
        setEmailUser(data.email_user || '')
        setHasPassword(data.has_password || false)
      })
      .catch(() => {})
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      const body = { email_user: emailUser, email_from: emailFrom }
      if (emailPassword) body.email_password = emailPassword

      const res = await apiFetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Settings saved successfully!' })
        if (emailPassword) setHasPassword(true)
        setEmailPassword('')
      } else {
        const err = await res.json()
        setSaveMsg({ type: 'error', text: err.detail || 'Failed to save.' })
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove Gmail configuration? Confirmation emails will stop being sent.')) return
    setRemoving(true)
    setSaveMsg(null)
    try {
      const res = await apiFetch('/api/settings/email', { method: 'DELETE' })
      if (res.ok) {
        setEmailUser('')
        setEmailPassword('')
        setEmailFrom('')
        setHasPassword(false)
        setSaveMsg({ type: 'success', text: 'Gmail configuration removed.' })
      } else {
        const err = await res.json()
        setSaveMsg({ type: 'error', text: err.detail || 'Failed to remove.' })
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setRemoving(false)
    }
  }

  async function handleTest(e) {
    e.preventDefault()
    if (!testEmail.trim()) return
    setTesting(true)
    setTestMsg(null)
    try {
      const res = await apiFetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: testEmail.trim() }),
      })
      if (res.ok) {
        setTestMsg({ type: 'success', text: `Test email sent to ${testEmail}!` })
      } else {
        const err = await res.json()
        setTestMsg({ type: 'error', text: err.detail || 'Failed to send test email.' })
      }
    } catch {
      setTestMsg({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setTesting(false)
    }
  }

  const isConfigured = !!(emailUser && hasPassword)

  return (
    <div className="stg-page">
      <div className="stg-container">

        <div className="stg-header">
          <div>
            <h1 className="stg-title">Settings</h1>
            <p className="stg-sub">Logged in as <strong>{user?.name}</strong> ({user?.email})</p>
          </div>
          <div className={`stg-status ${isConfigured ? 'stg-status--ok' : 'stg-status--warn'}`}>
            {isConfigured ? '✓ Email configured' : '⚠ Email not configured'}
          </div>
        </div>

        <div className="stg-card">
          <div className="stg-card-head">
            <div className="stg-card-icon">✉</div>
            <div>
              <div className="stg-card-title">Email Settings</div>
              <div className="stg-card-desc">
                Registration confirmation emails will be sent from this Gmail account.
                Each admin can set their own — your users receive emails from you, not a shared address.
              </div>
            </div>
          </div>

          <form className="stg-form" onSubmit={handleSave}>
            <div className="stg-field">
              <label className="stg-label">Gmail Address <span className="req">*</span></label>
              <input
                className="stg-input"
                type="email"
                placeholder="yourname@gmail.com"
                value={emailUser}
                onChange={e => setEmailUser(e.target.value)}
                required
              />
            </div>

            <div className="stg-field">
              <label className="stg-label">
                App Password <span className="req">*</span>
                {hasPassword && <span className="stg-label-hint"> — already set, enter new value to change</span>}
              </label>
              <div className="stg-password-row">
                <input
                  className="stg-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={hasPassword ? '••••••••••••••••' : 'Enter 16-character app password'}
                  value={emailPassword}
                  onChange={e => setEmailPassword(e.target.value)}
                  required={!hasPassword}
                />
                <button
                  type="button"
                  className="stg-eye-btn"
                  onClick={() => setShowPassword(v => !v)}
                  title={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              <p className="stg-hint">
                Use a Gmail App Password — not your account password.
                Get one at <strong>myaccount.google.com → Security → App Passwords</strong>.
              </p>
            </div>

            <div className="stg-field">
              <label className="stg-label">From Address <span className="stg-optional">(optional)</span></label>
              <input
                className="stg-input"
                type="email"
                placeholder="yourname@gmail.com"
                value={emailFrom}
                onChange={e => setEmailFrom(e.target.value)}
              />
              <p className="stg-hint">Defaults to the Gmail address above if left blank.</p>
            </div>

            {saveMsg && <div className={`stg-msg ${saveMsg.type}`}>{saveMsg.text}</div>}

            <div className="stg-btn-row">
              <button className="stg-save-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Email Settings'}
              </button>
              {isConfigured && (
                <button type="button" className="stg-remove-btn" onClick={handleRemove} disabled={removing}>
                  {removing ? 'Removing...' : 'Remove Gmail'}
                </button>
              )}
            </div>
          </form>
        </div>

        {isConfigured && (
          <div className="stg-card">
            <div className="stg-card-head">
              <div className="stg-card-icon">🧪</div>
              <div>
                <div className="stg-card-title">Send a Test Email</div>
                <div className="stg-card-desc">Verify your email settings are working correctly.</div>
              </div>
            </div>

            <form className="stg-form" onSubmit={handleTest}>
              <div className="stg-field">
                <label className="stg-label">Send test to</label>
                <div className="stg-test-row">
                  <input
                    className="stg-input"
                    type="email"
                    placeholder="recipient@example.com"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    required
                  />
                  <button className="stg-test-btn" disabled={testing}>
                    {testing ? 'Sending...' : 'Send Test'}
                  </button>
                </div>
              </div>
              {testMsg && <div className={`stg-msg ${testMsg.type}`}>{testMsg.text}</div>}
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
