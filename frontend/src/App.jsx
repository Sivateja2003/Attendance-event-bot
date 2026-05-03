import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import AttendancePage from './pages/AttendancePage'
import RegisterPage from './pages/RegisterPage'
import DisplayPage from './pages/DisplayPage'
import UsersPage from './pages/UsersPage'
import LobbyPage from './pages/LobbyPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import UserPortalPage from './pages/UserPortalPage'
import { AuthProvider, RequireAuth, useAuth } from './auth'

function Nav() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (pathname === '/display') return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="nav">
      <span className="nav-brand">FaceAttend</span>
      <div className="nav-links">
        {!user && (
          <>
            <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Login
            </NavLink>
            <NavLink to="/register" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Register
            </NavLink>
          </>
        )}

        {user?.role === 'admin' && (
          <>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Attendance
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
            <NavLink to="/display" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Display
            </NavLink>
          </>
        )}

        {user?.role === 'user' && (
          <NavLink to="/my" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            My Portal
          </NavLink>
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
          <Route path="/display" element={<DisplayPage />} />

          {/* Admin-only routes */}
          <Route path="/" element={<RequireAuth role="admin"><AttendancePage /></RequireAuth>} />
          <Route path="/spotregister" element={<RequireAuth role="admin"><RegisterPage /></RequireAuth>} />
          <Route path="/lobby" element={<RequireAuth role="admin"><LobbyPage /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth role="admin"><UsersPage /></RequireAuth>} />

          {/* User-only route */}
          <Route path="/my" element={<RequireAuth role="user"><UserPortalPage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
