import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined=loading, null=logged-out, obj=logged-in

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setUser(data))
      .catch(() => setUser(null))
  }, [])

  async function login(email, password) {
    const fd = new FormData()
    fd.append('email', email)
    fd.append('password', password)
    const res = await fetch('/api/auth/login', { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.detail || 'Login failed.')
    }
    const data = await res.json()
    setUser(data)
    return data
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
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
      navigate(user.role === 'admin' ? '/' : '/my', { replace: true })
    }
  }, [user, role, navigate])

  if (user === undefined) return <div className="auth-loading">Loading...</div>
  if (!user) return null
  if (role && user.role !== role) return null
  return children
}
