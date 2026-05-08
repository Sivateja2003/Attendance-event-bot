import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from './config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined=loading, null=logged-out, obj=logged-in

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setUser(data))
      .catch(() => setUser(null))
  }, [])

  async function login(email, password) {
    const fd = new FormData()
    fd.append('email', email)
    fd.append('password', password)
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.detail || 'Login failed.')
    }
    const data = await res.json()
    setUser(data)
    return data
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function RequireAuth({ role, children }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user === null) {
      navigate('/login', { replace: true })
    } else if (user && role && user.role !== role) {
      navigate('/login', { replace: true })
    }
  }, [user, role, navigate])

  if (user === undefined) return <div className="auth-loading">Loading...</div>
  if (!user) return null
  if (role && user.role !== role) return null
  return children
}
