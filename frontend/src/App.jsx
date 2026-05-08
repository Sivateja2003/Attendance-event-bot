import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import AttendancePage from './pages/AttendancePage'
import RegisterPage from './pages/RegisterPage'
import DisplayPage from './pages/DisplayPage'
import UsersPage from './pages/UsersPage'
import LobbyPage from './pages/LobbyPage'
import LoginPage from './pages/LoginPage'
import EventRegisterPage from './pages/EventRegisterPage'
import EventsPage from './pages/EventsPage'
import SettingsPage from './pages/SettingsPage'
import SignupPage from './pages/SignupPage'
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
      <span className="nav-brand">FaceAttend</span>
      <div className="nav-links">
        {!user && (
          <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Login
          </NavLink>
        )}

        {user?.role === 'admin' && (
          <>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Attendance
            </NavLink>
            <NavLink to="/events" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Events
            </NavLink>
            <NavLink to="/spotregister" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Spotregister
            </NavLink>
            <NavLink to="/lobby" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Who's Here
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Users
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Settings
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
          <Route path="/" element={<RequireAuth role="admin"><AttendancePage /></RequireAuth>} />
          <Route path="/events" element={<RequireAuth role="admin"><EventsPage /></RequireAuth>} />
          <Route path="/spotregister" element={<RequireAuth role="admin"><RegisterPage /></RequireAuth>} />
          <Route path="/lobby" element={<RequireAuth role="admin"><LobbyPage /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth role="admin"><UsersPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth role="admin"><SettingsPage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
