import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import RegisterPage from './pages/RegisterPage'
import DisplayPage from './pages/DisplayPage'
import UsersPage from './pages/UsersPage'
import LoginPage from './pages/LoginPage'
import EventRegisterPage from './pages/EventRegisterPage'
import EventsPage from './pages/EventsPage'
import SignupPage from './pages/SignupPage'
import CheckInPage from './pages/CheckInPage'
import { AuthProvider, RequireAuth, useAuth } from './auth'

function Nav() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (pathname.startsWith('/display')) return null
  if (pathname.startsWith('/register')) return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="nav">
      <span className="nav-brand">Attend</span>
      <div className="nav-links">
        {!user && (
          <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Login
          </NavLink>
        )}

        {user?.role === 'admin' && (
          <>
            <NavLink to="/events" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Events
            </NavLink>
            <NavLink to="/checkin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Check-In
            </NavLink>
            <NavLink to="/spotregister" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Spotregister
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Users
            </NavLink>
          </>
        )}

{user && (
          <div className="nav-user-area">
            <span className="nav-user-name">{user.name}</span>
            <button className="nav-logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<SignupPage />} />
          <Route path="/display/:eventId" element={<DisplayPage />} />
          <Route path="/register/:eventId" element={<EventRegisterPage />} />

          {/* Admin-only routes */}
          <Route path="/" element={<RequireAuth role="admin"><Navigate to="/events" replace /></RequireAuth>} />
          <Route path="/events" element={<RequireAuth role="admin"><EventsPage /></RequireAuth>} />
          <Route path="/checkin" element={<RequireAuth role="admin"><CheckInPage /></RequireAuth>} />
          <Route path="/spotregister" element={<RequireAuth role="admin"><RegisterPage /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth role="admin"><UsersPage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
