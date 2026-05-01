import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import AttendancePage from './pages/AttendancePage'
import RegisterPage from './pages/RegisterPage'
import DisplayPage from './pages/DisplayPage'
import UsersPage from './pages/UsersPage'
import LobbyPage from './pages/LobbyPage'

function Layout() {
  const { pathname } = useLocation()
  const isDisplay = pathname === '/display'

  return (
    <>
      {!isDisplay && (
        <nav className="nav">
          <span className="nav-brand">FaceAttend</span>
          <div className="nav-links">
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
          </div>
        </nav>
      )}
      <Routes>
        <Route path="/" element={<AttendancePage />} />
        <Route path="/spotregister" element={<RegisterPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
