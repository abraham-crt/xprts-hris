import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'
import { holidayMap, usFederalHolidays } from '@/lib/holidays'
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

function adjDate(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function isLate(clockIn: string): boolean {
  const laTime = new Date(clockIn).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [h, min] = laTime.split(':').map(Number)
  return h > 9 || (h === 9 && min > 30)
}

function fmtLaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

async function AdminDashboard() {
  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()
  const yesterday = adjDate(today, -1)
  const tomorrow = adjDate(today, 1)
  const [year, month] = today.split('-').map(Number)

  const [
    { data: allActive },
    { data: clockedInNow },
    { data: pendingApprovals },
    { data: outToday },
    { data: outTomorrow },
    { data: overtimeYesterday },
    { data: missingClockOuts },
    { data: todayEntries },
    { data: periodEntries },
    { data: payrollRows },
    { data: salaryRows },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, office_location').eq('status', 'active'),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, clock_in, employees!inner(name, office_location)')
      .eq('date', today)
      .is('clock_out', null),
    supabaseAdmin
      .from('leave_requests')
      .select('id, days_requested, start_date, end_date, employees!employee_id(name)')
      .eq('status', 'pending'),
    supabaseAdmin
      .from('leave_requests')
      .select('start_date, end_date, days_requested, employees!employee_id(name)')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
    supabaseAdmin
      .from('leave_requests')
      .select('start_date, end_date, days_requested, employees!employee_id(name)')
      .eq('status', 'approved')
      .lte('start_date', tomorrow)
      .gte('end_date', tomorrow),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, total_hours, employees!inner(name)')
      .eq('date', yesterday)
      .gt('total_hours', 8),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, date, clock_in, employees!inner(name)')
      .lt('date', today)
      .is('clock_out', null)
      .gte('date', adjDate(today, -14)),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, clock_in, clock_out, total_hours, employees!inner(name)')
      .eq('date', today),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, total_hours')
      .gte('date', periodStart)
      .lte('date', today)
      .not('total_hours', 'is', null),
    supabaseAdmin
      .from('payroll_deductions')
      .select('shortfall_deduction, net_pay, monthly_salary')
      .eq('pay_period_start', periodStart),
    supabaseAdmin
      .from('employees')
      .select('monthly_salary')
      .eq('status', 'active')
      .not('monthly_salary', 'is', null),
  ])

  // ── Derived values ───────────────────────────────────────────────────────
  const totalActive = allActive?.length ?? 0
  const clockedIn = clockedInNow ?? []
  const pending = pendingApprovals ?? []

  // Missing clock-ins: active employees with no entry at all today
  const clockedInIds = new Set((todayEntries ?? []).map((e: { employee_id: string }) => e.employee_id))
  const missingClockIns = (allActive ?? []).filter(e => !clockedInIds.has(e.id))

  // Late arrivals: clocked in today after 9:30 AM LA time
  const lateArrivals = (todayEntries ?? []).filter((e: { clock_in: string }) => isLate(e.clock_in))

  // Overtime this pay period: employees with total_hours summed > 44h in period
  const periodHoursMap: Record<string, number> = {}
  for (const e of (periodEntries ?? [])) {
    periodHoursMap[e.employee_id] = (periodHoursMap[e.employee_id] ?? 0) + (e.total_hours ?? 0)
  }
  const periodOT = Object.entries(periodHoursMap)
    .filter(([, h]) => h > 44)
    .map(([id, h]) => ({ id, hours: Math.round(h * 10) / 10 }))

  // Payroll totals
  const totalSalary = (salaryRows ?? []).reduce((s, r) => s + (r.monthly_salary ?? 0), 0)
  const totalDeductions = (payrollRows ?? []).reduce((s, r) => s + (r.shortfall_deduction ?? 0), 0)
  const totalNetPay = totalSalary - totalDeductions

  // Calendar
  const holidays = holidayMap(year)
  const nextYearHolidays = holidayMap(year + 1)
  const allHolidays = { ...holidays, ...nextYearHolidays }
  const upcomingHolidays = [...usFederalHolidays(year), ...usFederalHolidays(year + 1)]
    .filter(h => h.date >= today)
    .slice(0, 6)
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })
  const todayDay = parseInt(today.split('-')[2])
  const calCells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calCells.length % 7 !== 0) calCells.push(null)

  // Name lookup for period OT (join by employee_id from allActive)
  const nameById = Object.fromEntries((allActive ?? []).map(e => [e.id, e.name]))

  // ── Alert counts for top stat bar ───────────────────────────────────────
  const alertCount = (missingClockOuts?.length ?? 0) + lateArrivals.length + (missingClockIns.length > 0 ? 1 : 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Team snapshot · {today} · Pay period {periodStart} → {periodEnd}</p>
      </div>

      {/* ── Top stat bar ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
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
          <div className="stat-label">On PTO Today</div>
          <div className="stat-value" style={{ color: (outToday?.length ?? 0) > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {outToday?.length ?? 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value" style={{ color: pending.length > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
            {pending.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alerts</div>
          <div className="stat-value" style={{ color: alertCount > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
            {alertCount}
          </div>
        </div>
      </div>

      {/* ── Exceptions / Alerts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {/* Missing clock-outs */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>Missing Clock-Outs</div>
            {(missingClockOuts ?? []).length > 0 && (
              <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                {missingClockOuts!.length}
              </span>
            )}
          </div>
          {(missingClockOuts ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>None — all clear.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(missingClockOuts ?? []).slice(0, 4).map((e: { employee_id: string; date: string; clock_in: string; employees: { name: string } | { name: string }[] }, i: number) => {
                const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{emp?.name ?? '—'}</span>
                    <span style={{ color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{e.date}</span>
                  </div>
                )
              })}
              {(missingClockOuts?.length ?? 0) > 4 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>+{missingClockOuts!.length - 4} more</p>
              )}
            </div>
          )}
          <Link href="/dashboard/admin/time" style={{ display: 'block', marginTop: 10, fontSize: 11, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>View Team Time →</Link>
        </div>

        {/* Late arrivals today */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>Late Arrivals Today</div>
            {lateArrivals.length > 0 && (
              <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                {lateArrivals.length}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Clocked in after 9:30 AM LA time</p>
          {lateArrivals.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No late arrivals.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {lateArrivals.slice(0, 4).map((e: { employee_id: string; clock_in: string; employees: { name: string } | { name: string }[] }, i: number) => {
                const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{emp?.name ?? '—'}</span>
                    <span style={{ color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>{fmtLaTime(e.clock_in)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Missing clock-ins today */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>No Entry Today</div>
            {missingClockIns.length > 0 && (
              <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                {missingClockIns.length}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Active staff with no time entry today</p>
          {missingClockIns.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All staff have an entry.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {missingClockIns.slice(0, 5).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span className="dot-amber" />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{e.name}</span>
                  {e.office_location && <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize', marginLeft: 'auto' }}>{e.office_location}</span>}
                </div>
              ))}
              {missingClockIns.length > 5 && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>+{missingClockIns.length - 5} more</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Today's attendance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Clocked in now */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Clocked In Now</div>
          {clockedIn.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nobody clocked in yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {clockedIn.map((e: { employee_id: string; clock_in: string; employees: { name: string; office_location: string | null } | { name: string; office_location: string | null }[] }) => {
                const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees
                const sinceMs = Date.now() - new Date(e.clock_in).getTime()
                const hrs = Math.floor(sinceMs / 3600000)
                const mins = Math.floor((sinceMs % 3600000) / 60000)
                const isOT = hrs >= 8
                return (
                  <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="dot-green" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 12, color: isOT ? 'var(--amber)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: isOT ? 600 : 400 }}>
                      {hrs}h {mins}m{isOT ? ' ⚠' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <Link href="/dashboard/admin/time" style={{ display: 'block', marginTop: 10, fontSize: 11, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            Team Time →
          </Link>
        </div>

        {/* On PTO today */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>On PTO Today</div>
          {(outToday ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No approved leave for today.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(outToday ?? []).map((r: { days_requested: number; start_date: string; end_date: string; employees: { name: string } | { name: string }[] }, i: number) => {
                const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="dot-amber" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>thru {r.end_date}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* On leave tomorrow */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>On Leave Tomorrow <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({tomorrow})</span></div>
          {(outTomorrow ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No approved leave for tomorrow.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(outTomorrow ?? []).map((r: { days_requested: number; start_date: string; end_date: string; employees: { name: string } | { name: string }[] }, i: number) => {
                const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="dot-amber" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.days_requested}d</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Overtime ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Over 8h Yesterday <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({yesterday})</span></div>
          {(overtimeYesterday ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No overtime yesterday.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(overtimeYesterday ?? []).map((e: { employee_id: string; total_hours: number; employees: { name: string } | { name: string }[] }) => {
                const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees
                return (
                  <div key={e.employee_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{emp?.name ?? '—'}</span>
                    <span style={{ color: 'var(--amber)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{e.total_hours}h</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Overtime This Period</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Employees with &gt;44h logged in current pay period</p>
          {periodOT.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No overtime this period.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {periodOT.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{nameById[e.id] ?? e.id.slice(0, 8)}</span>
                  <span style={{ color: 'var(--amber)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{e.hours}h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Payroll + Pending approvals ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Payroll snapshot */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Payroll Snapshot</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>Current period · {periodStart} → {periodEnd}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Total Payroll</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                ${totalSalary.toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Deductions</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: totalDeductions > 0 ? 'var(--red)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                −${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Net Pay</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                ${totalNetPay.toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </div>
            </div>
          </div>
          <Link href="/dashboard/admin/payroll" style={{ display: 'block', marginTop: 14, fontSize: 11, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            Full Payroll Report →
          </Link>
        </div>

        {/* Pending leave */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Pending Leave Requests</div>
          {pending.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {pending.slice(0, 5).map((r: { id: string; days_requested: number; start_date: string; end_date: string; employees: { name: string } | { name: string }[] }) => {
                const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="dot-amber" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.days_requested}d · {r.start_date}
                    </span>
                  </div>
                )
              })}
              {pending.length > 5 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>+{pending.length - 5} more</p>
              )}
            </div>
          )}
          <Link href="/dashboard/approvals" style={{ display: 'block', marginTop: 10, fontSize: 11, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            Go to Approvals →
          </Link>
        </div>
      </div>

      {/* ── Calendar + Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Mini calendar */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>{monthName} {year} — US Holidays</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <th key={d} style={{ textAlign: 'center', padding: '2px 0', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: calCells.length / 7 }, (_, wk) => (
                <tr key={wk}>
                  {calCells.slice(wk * 7, wk * 7 + 7).map((day, i) => {
                    if (!day) return <td key={i} />
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isToday = day === todayDay
                    const isHoliday = !!allHolidays[dateStr]
                    return (
                      <td key={i} style={{ textAlign: 'center', padding: '3px 0' }}>
                        <span
                          title={isHoliday ? allHolidays[dateStr] : undefined}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: '50%', fontSize: 12,
                            fontWeight: isToday ? 700 : 400,
                            background: isToday ? 'var(--accent)' : isHoliday ? 'var(--accent-muted, rgba(99,102,241,0.12))' : 'transparent',
                            color: isToday ? '#fff' : isHoliday ? 'var(--accent)' : (i === 0 || i === 6) ? 'var(--text-muted)' : 'var(--text-primary)',
                            cursor: isHoliday ? 'help' : 'default',
                          }}
                        >
                          {day}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Upcoming</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {upcomingHolidays.map(h => (
                <div key={h.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{h.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{h.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/dashboard/admin/employees', label: 'Manage Employees', desc: `${totalActive} active staff` },
              { href: '/dashboard/approvals', label: 'Review Leave Requests', desc: `${pending.length} pending` },
              { href: '/dashboard/admin/payroll', label: 'Payroll Report', desc: `Net pay $${totalNetPay.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
              { href: '/dashboard/admin/time', label: 'Team Time', desc: `${clockedIn.length} clocked in now` },
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
  const [year, month] = today.split('-').map(Number)

  const [
    { data: employee },
    { data: ptoBefore },
    { data: pendingLeave },
    { data: todayEntry },
    { data: outToday },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('name, role, employment_start_date').eq('work_email', email).single(),
    supabaseAdmin.from('pto_balances').select('current_balance, last_accrual_date, accrual_history').eq('employee_id', userId).single(),
    supabaseAdmin.from('leave_requests').select('id').eq('employee_id', userId).eq('status', 'pending'),
    supabaseAdmin.from('time_entries').select('clock_in, clock_out').eq('employee_id', userId).eq('date', today).single(),
    supabaseAdmin
      .from('leave_requests')
      .select('days_requested, start_date, end_date, employees!employee_id(name)')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
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

  // Calendar data
  const holidays = holidayMap(year)
  const nextYearHolidays = holidayMap(year + 1)
  const allHolidays = { ...holidays, ...nextYearHolidays }
  const upcomingHolidays = [...usFederalHolidays(year), ...usFederalHolidays(year + 1)]
    .filter(h => h.date >= today)
    .slice(0, 5)

  // Build mini-calendar for current month
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })
  const todayDay = parseInt(today.split('-')[2])

  const calendarCells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete weeks
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Good {getGreeting()}, {employee?.name?.split(' ')[0] ?? 'there'}</h1>
        <p className="page-subtitle">Here&apos;s your summary for today — {today}.</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
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

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Link href="/dashboard/time" className="card-link">
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="card-title">My Time</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {!todayEntry ? "You haven't clocked in today." : todayEntry.clock_out ? 'Your day is logged.' : 'Timer is running.'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 10, fontWeight: 500 }}>Go to Time →</p>
          </div>
        </Link>
        <Link href="/dashboard/leave" className="card-link">
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="card-title">Leave Requests</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {(pendingLeave?.length ?? 0) > 0 ? `${pendingLeave!.length} request(s) awaiting approval.` : 'No pending leave requests.'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 10, fontWeight: 500 }}>Go to Leave →</p>
          </div>
        </Link>
      </div>

      {/* Calendar + Who's Out */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Mini calendar */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>{monthName} {year}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <th key={d} style={{ textAlign: 'center', padding: '2px 0', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: calendarCells.length / 7 }, (_, wk) => (
                <tr key={wk}>
                  {calendarCells.slice(wk * 7, wk * 7 + 7).map((day, i) => {
                    if (!day) return <td key={i} />
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isToday = day === todayDay
                    const isHoliday = !!allHolidays[dateStr]
                    const isSunday = i === 0
                    const isSaturday = i === 6
                    return (
                      <td key={i} style={{ textAlign: 'center', padding: '3px 0' }}>
                        <span
                          title={isHoliday ? allHolidays[dateStr] : undefined}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: '50%',
                            fontSize: 12,
                            fontWeight: isToday ? 700 : 400,
                            background: isToday ? 'var(--accent)' : isHoliday ? 'var(--accent-muted, rgba(99,102,241,0.12))' : 'transparent',
                            color: isToday ? '#fff' : isHoliday ? 'var(--accent)' : (isSunday || isSaturday) ? 'var(--text-muted)' : 'var(--text-primary)',
                            cursor: isHoliday ? 'help' : 'default',
                          }}
                        >
                          {day}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
              Today
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-muted, rgba(99,102,241,0.12))', border: '1px solid var(--accent)' }} />
              Holiday
            </span>
          </div>
        </div>

        {/* Upcoming holidays + who's out */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ flex: '1 1 auto' }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Upcoming US Holidays</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upcomingHolidays.map(h => (
                <div key={h.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{h.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{h.date}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ flex: '0 0 auto' }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Out Today</div>
            {(outToday ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Everyone&apos;s in today.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(outToday ?? []).map((r: { days_requested: number; start_date: string; end_date: string; employees: { name: string } | { name: string }[] }, i: number) => {
                  const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span className="dot-amber" />
                      <span style={{ color: 'var(--text-primary)' }}>{emp?.name ?? '—'}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{r.days_requested}d</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BayLegal Updates */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>BayLegal Updates</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-secondary, var(--sidebar-bg))', fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Welcome to the HRIS Portal</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Track your time, manage leave, and view your PTO balance all in one place. Reach out to HR for any questions.</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Company announcements will appear here.</p>
        </div>
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
