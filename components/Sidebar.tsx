'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { NotificationBell } from './NotificationBell'

const icons = {
  home: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h4v-4h2v4h4a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z"/></svg>,
  person: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z" clipRule="evenodd"/></svg>,
  clock: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .553.894l2.5 1.25a1 1 0 1 0 .894-1.788L11 9.382V6z" clipRule="evenodd"/></svg>,
  calendar: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>,
  check: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd"/></svg>,
  users: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM0 16a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1H0v-1zm14-2a4 4 0 0 1 4 4v1h-4v-5z"/></svg>,
  chart: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5zm6-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7zm5-3a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0V4z"/></svg>,
  signout: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h6a1 1 0 1 0 0-2H4V5h5a1 1 0 1 0 0-2H3zm11.293 3.293a1 1 0 0 1 1.414 1.414L13.414 10l2.293 2.293a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3z" clipRule="evenodd"/></svg>,
  close: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>,
}

type NavItem = { href: string; label: string; icon: keyof typeof icons; exact?: boolean }

function NavLink({ href, label, icon, exact, onClick }: NavItem & { onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)))
  return (
    <Link href={href} className={`sidebar-link ${isActive ? 'active' : ''}`} onClick={onClick} aria-current={isActive ? 'page' : undefined}>
      {icons[icon]}
      {label}
    </Link>
  )
}

export function Sidebar({ role, name, email, isOpen, onClose }: {
  role: string
  name: string
  email: string
  isOpen?: boolean
  onClose?: () => void
}) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-mobile-open' : ''}`}>
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="sidebar-logo-mark">HRIS Portal</div>
          <div className="sidebar-logo-sub">xprts.com</div>
        </div>
        {onClose && (
          <button
            className="sidebar-mobile-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            {icons.close}
          </button>
        )}
      </div>

      <nav className="sidebar-section">
        <NavLink href="/dashboard" label="Dashboard" icon="home" exact onClick={onClose} />
        <NavLink href="/dashboard/time" label="My Time" icon="clock" onClick={onClose} />
        <NavLink href="/dashboard/leave" label="Leave" icon="calendar" onClick={onClose} />
        <NavLink href="/dashboard/profile" label="My Profile" icon="person" onClick={onClose} />

        {(role === 'approver' || role === 'admin') && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-label">Team</div>
            <NavLink href="/dashboard/approvals" label="Approvals" icon="check" onClick={onClose} />
          </>
        )}

        {role === 'admin' && (
          <>
            <NavLink href="/dashboard/admin/time" label="Team Time" icon="users" onClick={onClose} />
            <NavLink href="/dashboard/admin/employees" label="Employees" icon="users" onClick={onClose} />
            <NavLink href="/dashboard/admin/payroll" label="Payroll" icon="chart" onClick={onClose} />
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div className="sidebar-user-role">{role}</div>
        </div>
        <NotificationBell />
        <button className="sidebar-signout" onClick={() => signOut({ callbackUrl: '/login' })} title="Sign out">
          {icons.signout}
        </button>
      </div>
    </aside>
  )
}
