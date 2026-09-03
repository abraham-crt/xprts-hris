import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import Link from 'next/link'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/login')

  const userId = session.user.id
  const today = laToday()
  const { periodStart } = laPeriodBounds()

  const [
    { data: employee },
    { data: pto },
    { data: recentTime },
    { data: recentLeave },
    { data: deduction },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('*').eq('id', userId).single(),
    supabaseAdmin.from('pto_balances').select('current_balance, last_accrual_date').eq('employee_id', userId).single(),
    supabaseAdmin
      .from('time_entries')
      .select('id, date, clock_in, clock_out, total_hours, is_edited')
      .eq('employee_id', userId)
      .order('date', { ascending: false })
      .limit(7),
    supabaseAdmin
      .from('leave_requests')
      .select('id, start_date, end_date, days_requested, status, is_half_day, created_at')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('payroll_deductions')
      .select('leave_days, pto_days_used, shortfall_days, shortfall_deduction, net_pay, monthly_salary')
      .eq('employee_id', userId)
      .eq('pay_period_start', periodStart)
      .single(),
  ])

  // Fetch approver name after employee is resolved
  let approverName = '—'
  if (employee?.approver_id) {
    const { data: apprData } = await supabaseAdmin
      .from('employees')
      .select('name')
      .eq('id', employee.approver_id)
      .single()
    approverName = apprData?.name ?? '—'
  }

  // Tenure calculation
  const startDate: string | null = employee?.employment_start_date ?? null
  let yearsLabel = '—'
  if (startDate) {
    const [sy, sm] = startDate.split('-').map(Number)
    const [ty, tm] = today.split('-').map(Number)
    const monthsEmployed = (ty - sy) * 12 + (tm - sm)
    const yrs = Math.floor(monthsEmployed / 12)
    const mos = monthsEmployed % 12
    yearsLabel = yrs > 0 ? `${yrs}y ${mos}m` : `${mos} months`
  }

  const dailyRate = employee?.monthly_salary
    ? ((employee.monthly_salary / 173.33) * 8).toFixed(2)
    : null

  function fmtTime(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
    })
  }

  const statusStyle: Record<string, { background: string; color: string }> = {
    approved: { background: 'var(--green-muted, rgba(34,197,94,0.12))', color: 'var(--green)' },
    denied: { background: 'var(--red-muted, rgba(239,68,68,0.12))', color: 'var(--red)' },
    pending: { background: 'var(--amber-muted, rgba(245,158,11,0.12))', color: 'var(--amber)' },
  }

  const role = session.user.role ?? 'employee'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Your employment information and history.</p>
      </div>

      {/* Personal + Employment info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Personal Information</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProfileRow label="Full Name" value={employee?.name ?? '—'} />
            <ProfileRow label="Work Email" value={employee?.work_email ?? session.user.email ?? '—'} />
            <ProfileRow label="Location" value={employee?.office_location ? capitalize(employee.office_location) : '—'} />
            <ProfileRow label="Role" value={capitalize(role)} />
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Employment</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProfileRow label="Start Date" value={startDate ?? '—'} />
            <ProfileRow label="Tenure" value={yearsLabel} />
            <ProfileRow label="Status" value={employee?.status ? capitalize(employee.status) : '—'} />
            <ProfileRow label="Approver" value={approverName} />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-label">PTO Balance</div>
          <div className="stat-value">{pto?.current_balance ?? 0}<span className="stat-unit">days</span></div>
        </div>
        {employee?.monthly_salary ? (
          <>
            <div className="stat-card">
              <div className="stat-label">Monthly Salary</div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                ${Number(employee.monthly_salary).toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Daily Rate</div>
              <div className="stat-value" style={{ fontSize: 18 }}>${dailyRate}</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-label">Last Accrual</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{pto?.last_accrual_date ?? '—'}</div>
            </div>
            <div className="stat-card" />
          </>
        )}
        <div className="stat-card">
          <div className="stat-label">Last Accrual</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{pto?.last_accrual_date ?? '—'}</div>
        </div>
      </div>

      {/* Current period payroll */}
      {deduction && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Current Pay Period</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            <MiniStat label="Leave Days" value={String(deduction.leave_days ?? 0)} />
            <MiniStat label="PTO Used" value={String(deduction.pto_days_used ?? 0)} />
            <MiniStat label="Unpaid Days" value={String(deduction.shortfall_days ?? 0)} />
            <MiniStat
              label="Pay Deduction"
              value={`$${Number(deduction.shortfall_deduction ?? 0).toFixed(2)}`}
              color="var(--red)"
            />
            <MiniStat
              label="Est. Net Pay"
              value={`$${Number(deduction.net_pay ?? deduction.monthly_salary ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
              color="var(--green)"
            />
          </div>
        </div>
      )}

      {/* Recent time log */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-title">Recent Time Log</div>
          <Link href="/dashboard/time" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            View all →
          </Link>
        </div>
        {(recentTime ?? []).length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No time entries yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Clock In', 'Clock Out', 'Hours', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(recentTime ?? []).map((e: { id: string; date: string; clock_in: string; clock_out: string | null; total_hours: number | null; is_edited: boolean }) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{e.date}</td>
                    <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtTime(e.clock_in)}</td>
                    <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {e.clock_out
                        ? fmtTime(e.clock_out)
                        : <span className="badge badge-green" style={{ fontSize: 11 }}>Active</span>}
                    </td>
                    <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {e.total_hours != null ? `${e.total_hours}h` : '—'}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      {e.is_edited && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>edited</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leave history */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-title">Leave History</div>
          <Link href="/dashboard/leave" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
            View all →
          </Link>
        </div>
        {(recentLeave ?? []).length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No leave requests yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Period', 'Days', 'Type', 'Status', 'Submitted'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(recentLeave ?? []).map((r: { id: string; start_date: string; end_date: string; days_requested: number; status: string; is_half_day: boolean; created_at: string }) => {
                  const style = statusStyle[r.status] ?? statusStyle.pending
                  const period = r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--text-primary)' }}>{period}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.days_requested}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{r.is_half_day ? 'Half-day' : 'Full day'}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ ...style, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          {capitalize(r.status)}
                        </span>
                      </td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 120 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
