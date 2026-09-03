import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { leaveTypeLabel } from '@/lib/countries'
import Link from 'next/link'

const LA_TZ = 'America/Los_Angeles'
const STANDARD_MONTHLY_HOURS = 173.33

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: LA_TZ })
}
function fmtH(h: number | null) {
  if (h == null) return '—'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
function tenure(startDate: string): string {
  const ms = Date.now() - new Date(startDate + 'T12:00:00').getTime()
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`
}

export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { id } = params
  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()

  const [
    { data: emp },
    { data: manager },
    { data: approver },
    { data: pto },
    { data: leaveRequests },
    { data: timeEntries },
    { data: deductionRow },
    { data: auditLog },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('*').eq('id', id).single(),
    supabaseAdmin.from('employees').select('name, work_email').eq('id', id).single().then(() => ({ data: null })), // placeholder
    supabaseAdmin.from('employees').select('name').eq('id', id).single().then(() => ({ data: null })), // placeholder
    supabaseAdmin.from('pto_balances').select('current_balance').eq('employee_id', id).single(),
    supabaseAdmin.from('leave_requests').select('*').eq('employee_id', id).order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('time_entries').select('*').eq('employee_id', id).gte('date', periodStart).lte('date', today).order('date', { ascending: false }),
    supabaseAdmin.from('payroll_deductions').select('*').eq('pay_period_start', periodStart).eq('employee_id', id).single(),
    supabaseAdmin.from('audit_log').select('*').eq('employee_id', id).order('performed_at', { ascending: false }).limit(50),
  ])

  if (!emp) redirect('/dashboard/admin/employees')

  // Fetch manager and approver names separately
  const [managerData, approverData] = await Promise.all([
    emp.manager_id ? supabaseAdmin.from('employees').select('name').eq('id', emp.manager_id).single() : Promise.resolve({ data: null }),
    emp.approver_id ? supabaseAdmin.from('employees').select('name').eq('id', emp.approver_id).single() : Promise.resolve({ data: null }),
  ])

  const managerName = managerData?.data?.name ?? null
  const approverName = approverData?.data?.name ?? null

  // Time stats for period
  const totalHours = (timeEntries ?? []).reduce((s: number, e) => s + (e.total_hours ?? 0), 0)
  const regularHours = Math.min(totalHours, 8 * (timeEntries ?? []).length)
  const otHours = Math.max(0, totalHours - regularHours)
  const daysPresent = (timeEntries ?? []).filter((e: { clock_in: string }) => e.clock_in).length

  // Leave stats
  const approvedLeave = (leaveRequests ?? []).filter((r: { status: string }) => r.status === 'approved')
  const pendingLeave = (leaveRequests ?? []).filter((r: { status: string }) => r.status === 'pending')

  // Payroll
  const dailyRate = emp.monthly_salary ? (emp.monthly_salary / STANDARD_MONTHLY_HOURS) * 8 : null
  const hourlyRate = emp.monthly_salary ? emp.monthly_salary / STANDARD_MONTHLY_HOURS : null
  const netPay = deductionRow?.net_pay ?? emp.monthly_salary

  const STATUS_BADGE: Record<string, string> = {
    pending: 'badge-amber',
    approved: 'badge-green',
    denied: 'badge-red',
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard/admin/employees" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
            ← Employees
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 6 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{emp.name}</h1>
            <p className="page-subtitle">
              {emp.employee_code && <span style={{ fontFamily: 'monospace', marginRight: 10 }}>{emp.employee_code}</span>}
              {emp.work_email}
              {emp.employment_start_date && <span style={{ marginLeft: 10, color: 'var(--text-muted)' }}>· {tenure(emp.employment_start_date)} tenure</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{emp.status}</span>
            <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{emp.role}</span>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">PTO Balance</div>
          <div className="stat-value" style={{ fontSize: 22, color: (pto?.current_balance ?? 0) < 3 ? 'var(--amber)' : 'var(--green)' }}>
            {pto?.current_balance ?? 0}<span className="stat-unit">days</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Hours</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmtH(Math.round(totalHours * 10) / 10)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT This Period</div>
          <div className="stat-value" style={{ fontSize: 22, color: otHours > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmtH(Math.round(otHours * 10) / 10)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Leave</div>
          <div className="stat-value" style={{ fontSize: 22, color: pendingLeave.length > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{pendingLeave.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net Pay (Period)</div>
          <div className="stat-value" style={{ fontSize: 18, color: 'var(--green)' }}>
            {netPay != null ? `$${netPay.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Profile */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Profile</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {[
              { label: 'Full Name', value: emp.name },
              { label: 'Work Email', value: emp.work_email },
              { label: 'Employee Code', value: emp.employee_code ?? '—' },
              { label: 'Office Location', value: emp.office_location ?? '—' },
              { label: 'Role', value: emp.role },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Employment Info */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Employment</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {[
              { label: 'Type', value: emp.employment_type ?? 'full-time' },
              { label: 'Status', value: emp.status },
              { label: 'Start Date', value: emp.employment_start_date ? fmtDate(emp.employment_start_date) : '—' },
              { label: 'Tenure', value: emp.employment_start_date ? tenure(emp.employment_start_date) : '—' },
              { label: 'Manager', value: managerName ?? '—' },
              { label: 'Approver', value: approverName ?? '—' },
              { label: 'Shift', value: emp.shift_schedule ?? '—' },
              { label: 'Payslip Delivery', value: emp.payslip_delivery ?? 'email' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Payroll */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Payroll — Current Period</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {[
              { label: 'Monthly Salary', value: emp.monthly_salary != null ? `$${emp.monthly_salary.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
              { label: 'Daily Rate', value: dailyRate != null ? `$${dailyRate.toFixed(2)}` : '—' },
              { label: 'Hourly Rate', value: hourlyRate != null ? `$${hourlyRate.toFixed(2)}` : '—' },
              { label: 'Regular Hours', value: fmtH(Math.round(regularHours * 10) / 10) },
              { label: 'OT Hours', value: fmtH(Math.round(otHours * 10) / 10) },
              { label: 'PTO Used', value: deductionRow?.pto_days_used != null ? `${deductionRow.pto_days_used} days` : '—' },
              { label: 'Pay Deduction', value: deductionRow?.shortfall_deduction ? `-$${deductionRow.shortfall_deduction.toFixed(2)}` : '—' },
              { label: 'Net Pay', value: netPay != null ? `$${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontWeight: row.label === 'Net Pay' ? 700 : 500, color: row.label === 'Net Pay' ? 'var(--green)' : row.label === 'Pay Deduction' && row.value !== '—' ? 'var(--red)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* This-period time */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Time This Period</div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{periodStart} → {periodEnd}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(timeEntries ?? []).slice(0, 8).map((e: { id: string; date: string; clock_in: string | null; clock_out: string | null; total_hours: number | null; is_edited: boolean }) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtDate(e.date)}</span>
                <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {e.clock_in ? fmtTime(e.clock_in) : '—'} → {e.clock_out ? fmtTime(e.clock_out) : '—'}
                </span>
                <span style={{ fontWeight: 600, color: (e.total_hours ?? 0) > 8 ? 'var(--amber)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtH(e.total_hours)}
                  {e.is_edited && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>edited</span>}
                </span>
              </div>
            ))}
            {(timeEntries ?? []).length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No time entries this period.</p>}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Days Present: {daysPresent}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Total: {fmtH(Math.round(totalHours * 10) / 10)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Leave History */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Leave History</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {approvedLeave.length} approved · {pendingLeave.length} pending
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(leaveRequests ?? []).length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No leave requests.</td></tr>
                : (leaveRequests ?? []).map((r: { id: string; leave_type: string | null; start_date: string; end_date: string; days_requested: number; status: string; created_at: string; reason: string | null; is_half_day: boolean }) => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {leaveTypeLabel(r.leave_type ?? 'pto')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                      {r.is_half_day && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Half</span>}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.days_requested}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>{r.reason ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="card-title" style={{ marginBottom: 2 }}>Audit Trail</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All changes to this employee's record</p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Action</th><th>Details</th><th>When</th></tr>
            </thead>
            <tbody>
              {(auditLog ?? []).length === 0
                ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No audit records.</td></tr>
                : (auditLog ?? []).map((a: { id: string; action: string; details: Record<string, unknown>; performed_at: string }) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{a.action.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{JSON.stringify(a.details).slice(0, 120)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(a.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: LA_TZ })}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
