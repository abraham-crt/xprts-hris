import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/login')

  const role = session.user.role ?? 'employee'
  const today = laToday()

  if (role === 'admin') return AdminDashboard()
  return EmployeeDashboard(session.user.id, session.user.email, today)
}

// ── Admin dashboard ──────────────────────────────────────────────────────────

async function AdminDashboard() {
  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()

  const [
    { data: employees },
    { data: clockedInToday },
    { data: pendingApprovals },
    { data: leaveThisPeriod },
    { data: totalShortfalls },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('id').eq('status', 'active'),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, clock_in, employees!inner(name, office_location)')
      .eq('date', today)
      .is('clock_out', null),
    supabaseAdmin
      .from('leave_requests')
      .select('id, employee_id, days_requested, start_date, end_date, employees!inner(name)')
      .eq('status', 'pending'),
    supabaseAdmin
      .from('leave_requests')
      .select('days_requested')
      .eq('status', 'approved')
      .gte('start_date', periodStart)
      .lte('end_date', periodEnd),
    supabaseAdmin
      .from('payroll_deductions')
      .select('shortfall_deduction')
      .eq('pay_period_start', periodStart),
  ])

  const totalActive = employees?.length ?? 0
  const clockedIn = clockedInToday ?? []
  const pending = pendingApprovals ?? []
  const totalLeaveDays = (leaveThisPeriod ?? []).reduce((s, r) => s + (r.days_requested ?? 0), 0)
  const totalDeductions = (totalShortfalls ?? []).reduce((s, r) => s + (r.shortfall_deduction ?? 0), 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Overview</h1>
        <p className="page-subtitle">Team snapshot for {today} · Pay period {periodStart} → {periodEnd}</p>
      </div>

      {/* Top stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Active Staff</div>
          <div className="stat-value">{totalActive}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clocked In Now</div>
          <div className="stat-value" style={{ color: clockedIn.length > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
            {clockedIn.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value" style={{ color: pending.length > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {pending.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Leave Days (Period)</div>
          <div className="stat-value" style={{ color: totalLeaveDays > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {totalLeaveDays}<span className="stat-unit">days</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Clocked in now */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Clocked In Today</div>
          {clockedIn.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nobody clocked in yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clockedIn.map((e: { employee_id: string; clock_in: string; employees: { name: string; office_location: string | null } | { name: string; office_location: string | null }[] }) => {
                const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees
                const sinceMs = Date.now() - new Date(e.clock_in).getTime()
                const hrs = Math.floor(sinceMs / 3600000)
                const mins = Math.floor((sinceMs % 3600000) / 60000)
                return (
                  <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="dot-green" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                      {emp?.office_location && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{emp.office_location}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {hrs}h {mins}m
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <Link href="/dashboard/admin/time" style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            View all time entries →
          </Link>
        </div>

        {/* Pending approvals */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Pending Leave Requests</div>
          {pending.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.slice(0, 5).map((r: { id: string; days_requested: number; start_date: string; end_date: string; employees: { name: string } | { name: string }[] }) => {
                const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="dot-amber" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.days_requested}d · {r.start_date}
                    </span>
                  </div>
                )
              })}
              {pending.length > 5 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>+{pending.length - 5} more</p>
              )}
            </div>
          )}
          <Link href="/dashboard/approvals" style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            Go to Approvals →
          </Link>
        </div>

        {/* Payroll snapshot */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Payroll Snapshot</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Current pay period deductions</p>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Total Deductions</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: totalDeductions > 0 ? 'var(--red)' : 'var(--text-muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Leave Approved</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                {totalLeaveDays}<span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>days</span>
              </div>
            </div>
          </div>
          <Link href="/dashboard/admin/payroll" style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            View Payroll Report →
          </Link>
        </div>

        {/* Quick links */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/dashboard/admin/employees', label: 'Manage Employees', desc: 'Add, edit, assign approvers' },
              { href: '/dashboard/approvals', label: 'Review Leave Requests', desc: `${pending.length} pending` },
              { href: '/dashboard/admin/payroll', label: 'Payroll Report', desc: 'Export CSV for the period' },
              { href: '/dashboard/admin/time', label: 'Team Time', desc: 'View all clock-in records' },
            ].map(item => (
              <Link key={item.href} href={item.href} className="quick-action-link">
                <div className="quick-action-card">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.desc}</div>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: 14 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Employee dashboard ───────────────────────────────────────────────────────

async function EmployeeDashboard(userId: string, email: string, today: string) {
  const [{ data: employee }, { data: ptoBefore }, { data: pendingLeave }, { data: todayEntry }] = await Promise.all([
    supabaseAdmin.from('employees').select('name, role, employment_start_date').eq('work_email', email).single(),
    supabaseAdmin.from('pto_balances').select('current_balance, last_accrual_date, accrual_history').eq('employee_id', userId).single(),
    supabaseAdmin.from('leave_requests').select('id').eq('employee_id', userId).eq('status', 'pending'),
    supabaseAdmin.from('time_entries').select('clock_in, clock_out').eq('employee_id', userId).eq('date', today).single(),
  ])

  let ptoBalance = ptoBefore?.current_balance ?? 0
  if (employee?.employment_start_date) {
    const result = computeAccrualUpdates({
      employmentStartDate: employee.employment_start_date,
      currentBalance: ptoBefore?.current_balance ?? 0,
      lastAccrualDate: ptoBefore?.last_accrual_date ?? null,
      accrualHistory: (ptoBefore?.accrual_history ?? []) as AccrualEvent[],
    })
    if (result.hasChanges) {
      const { data: updated } = await supabaseAdmin
        .from('pto_balances')
        .upsert({ employee_id: userId, current_balance: result.newBalance, last_accrual_date: result.newLastAccrualDate, accrual_history: result.newAccrualHistory }, { onConflict: 'employee_id' })
        .select('current_balance').single()
      ptoBalance = updated?.current_balance ?? result.newBalance
    }
  }

  const clockStatus = !todayEntry ? 'Not clocked in' : todayEntry.clock_out ? 'Clocked out' : 'Clocked in'
  const clockColor = !todayEntry ? 'badge-amber' : todayEntry.clock_out ? 'badge-gray' : 'badge-green'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Good {getGreeting()}, {employee?.name?.split(' ')[0] ?? 'there'}</h1>
        <p className="page-subtitle">Here&apos;s your summary for today.</p>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">PTO Balance</div>
          <div className="stat-value">{ptoBalance}<span className="stat-unit">days</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Leave</div>
          <div className="stat-value">{pendingLeave?.length ?? 0}<span className="stat-unit">requests</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today&apos;s Status</div>
          <div style={{ marginTop: 8 }}><span className={`badge ${clockColor}`}>{clockStatus}</span></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Link href="/dashboard/time" className="card-link">
          <div className="card">
            <div className="card-title">My Time</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {!todayEntry ? "You haven't clocked in today." : todayEntry.clock_out ? 'Your day is logged.' : 'Timer is running.'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 12, fontWeight: 500 }}>Go to Time →</p>
          </div>
        </Link>
        <Link href="/dashboard/leave" className="card-link">
          <div className="card">
            <div className="card-title">Leave Requests</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {(pendingLeave?.length ?? 0) > 0 ? `${pendingLeave!.length} request(s) awaiting approval.` : 'No pending leave requests.'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 12, fontWeight: 500 }}>Go to Leave →</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
