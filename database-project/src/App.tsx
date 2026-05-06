import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import './App.css'
import EmployeePage from './pages/EmployeePage'
import MembershipPage from './pages/MembershipPage'
import OrderPage from './pages/OrderPage'
import OrderHistoryPage from './pages/OrderHistoryPage'

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <NavLink to="/" className="brand" aria-label="Restaurant order entry">
            Restaurant DB
          </NavLink>
          <nav className="primary-nav" aria-label="Primary navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Orders
            </NavLink>
            <NavLink
              to="/order-history"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Order History
            </NavLink>
            <NavLink
              to="/memberships"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Memberships
            </NavLink>
            <NavLink
              to="/employees"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Employees
            </NavLink>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<OrderPage />} />
            <Route path="/order-history" element={<OrderHistoryPage />} />
            <Route path="/memberships" element={<MembershipPage />} />
            <Route path="/employees" element={<EmployeePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
