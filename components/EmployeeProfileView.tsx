'use client'

import { useState } from 'react'
import Link from 'next/link'
import { leaveTypeLabel } from '@/lib/countries'

const LA_TZ = 'America/Los_Angeles'
const STANDARD_MONTHLY_HOURS = 173.33

type Emp = {
  id: string; name: string; work_email: string; employee_code: string | null
  role: string; status: string; employment_type: string | null
  employment_start_date: string | null; office_location: string | null
  monthly_salary: number | null; shift_schedule: string | null
  payslip_delivery: string | null
}
type TimeEntry = {
  id: string; date: string; clock_in: string | null; clock_out: string | null
  total_hours: number | null; is_edited: boolean
}
type LeaveRequest = {
  id: string; leave_type: string | null; start_date: string; end_date: string
  days_requested: number; status: string; created_at: string
  reason: string | null; is_half_day: boolean; approver_note: string | null
  reviewed_by: string | null
}
type AuditEntry = {
  id: string; action: string; details: Record<string, unknown>; performed_at: string
}
type DeductionRow = {
  pto_days_used: number; shortfall_days: number; shortfall_deduction: number; net_pay: number
} | null
type PayslipRow = {
  id: string; pay_period_start: string; pay_period_end: string
  monthly_salary: number | null; daily_rate: number | null
  leave_days: number | null; pto_days_used: number | null
  shortfall_days: number | null; shortfall_deduction: number | null; net_pay: number | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', denied: 'badge-red',
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: LA_TZ })
}
function fmtH(h: number | null) {
  if (h == null) return '—'
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
function tenure(startDate: string): string {
  const ms = Date.now() - new Date(startDate + 'T12:00:00').getTime()
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12); const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`
}
function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function EmployeeProfileView({ emp, managerName, approverName, pto, leaveRequests, timeEntries, deductionRow, auditLog, payslipHistory, periodStart, periodEnd }: {
  emp: Emp
  managerName: string | null
  approverName: string | null
  pto: number
  leaveRequests: LeaveRequest[]
  timeEntries: TimeEntry[]
  deductionRow: DeductionRow
  auditLog: AuditEntry[]
  payslipHistory: PayslipRow[]
  periodStart: string
  periodEnd: string
}) {
  const [tab, setTab] = useState<'overview' | 'time' | 'leave' | 'payroll' | 'audit'>('overview')
  const [leaveStatus, setLeaveStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('all')

  const totalHours = timeEntries.reduce((s, e) => s + (e.total_hours ?? 0), 0)
  const regularHours = Math.min(totalHours, 8 * timeEntries.length)
  const otHours = Math.max(0, totalHours - regularHours)
  const daysPresent = timeEntries.filter(e => e.clock_in).length
  const dailyRate = emp.monthly_salary ? (emp.monthly_salary / STANDARD_MONTHLY_HOURS) * 8 : null
  const hourlyRate = emp.monthly_salary ? emp.monthly_salary / STANDARD_MONTHLY_HOURS : null
  const netPay = deductionRow?.net_pay ?? emp.monthly_salary
  const pendingLeave = leaveRequests.filter(r => r.status === 'pending')
  const approvedLeave = leaveRequests.filter(r => r.status === 'approved')

  const filteredLeave = leaveStatus === 'all' ? leaveRequests : leaveRequests.filter(r => r.status === leaveStatus)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'time', label: `Time Log (${timeEntries.length})` },
    { id: 'leave', label: `Leave (${leaveRequests.length})` },
    { id: 'payroll', label: 'Payroll' },
    { id: 'audit', label: `Audit Trail (${auditLog.length})` },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">PTO Balance</div>
          <div className="stat-value" style={{ fontSize: 22, color: pto < 3 ? 'var(--amber)' : 'var(--green)' }}>
            {pto}<span className="stat-unit">days</span>
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

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Payroll — Current Period</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
              {[
                { label: 'Monthly Salary', value: fmtMoney(emp.monthly_salary) },
                { label: 'Daily Rate', value: dailyRate != null ? `$${dailyRate.toFixed(2)}` : '—' },
                { label: 'Hourly Rate', value: hourlyRate != null ? `$${hourlyRate.toFixed(2)}` : '—' },
                { label: 'PTO Used', value: deductionRow?.pto_days_used != null ? `${deductionRow.pto_days_used} days` : '—' },
                { label: 'Regular Hours', value: fmtH(Math.round(regularHours * 10) / 10) },
                { label: 'OT Hours', value: fmtH(Math.round(otHours * 10) / 10) },
                { label: 'Pay Deduction', value: deductionRow?.shortfall_deduction ? `-$${deductionRow.shortfall_deduction.toFixed(2)}` : '—' },
                { label: 'Net Pay', value: netPay != null ? fmtMoney(netPay) : '—' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{row.label}</div>
                  <div style={{ fontSize: 15, fontWeight: row.label === 'Net Pay' ? 700 : 500, color: row.label === 'Net Pay' ? 'var(--green)' : row.label === 'Pay Deduction' && row.value !== '—' ? 'var(--red)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/dashboard/admin/employees" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← All Employees</Link>
            <Link href={`/dashboard/admin/employees/${emp.id}`} onClick={() => setTab('audit')} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>View Audit Trail →</Link>
          </div>
        </div>
      )}

      {/* ── Time Log ── */}
      {tab === 'time' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Time Log</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {periodStart} → {periodEnd} · {daysPresent} days · {fmtH(Math.round(totalHours * 10) / 10)} total
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>OT</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No time entries this period.</td></tr>
                  : timeEntries.map(e => {
                    const ot = e.total_hours != null ? Math.max(0, e.total_hours - 8) : 0
                    return (
                      <tr key={e.id}>
                        <td style={{ fontSize: 12.5 }}>{fmtDate(e.date)}</td>
                        <td style={{ fontSize: 12.5 }}>{e.clock_in ? fmtTime(e.clock_in) : '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{e.clock_out ? fmtTime(e.clock_out) : <span className="badge badge-amber">Missing</span>}</td>
                        <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (e.total_hours ?? 0) > 8 ? 'var(--amber)' : 'var(--text-primary)' }}>{fmtH(e.total_hours)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: ot > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: ot > 0 ? 600 : 400 }}>{ot > 0 ? `+${fmtH(ot)}` : '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.is_edited ? 'edited' : '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leave ── */}
      {tab === 'leave' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>Leave History</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {approvedLeave.length} approved · {pendingLeave.length} pending
            </div>
            <div className="tabs" style={{ marginBottom: 0 }}>
              {(['all', 'pending', 'approved', 'denied'] as const).map(s => (
                <button key={s} onClick={() => setLeaveStatus(s)} className={`tab-btn ${leaveStatus === s ? 'active' : ''}`} style={{ fontSize: 12, textTransform: 'capitalize' }}>
                  {s === 'all' ? `All (${leaveRequests.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${leaveRequests.filter(r => r.status === s).length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Type</th><th>Period</th><th>Days</th><th>Status</th><th>Submitted</th><th>Reason</th><th>Approver Note</th></tr>
              </thead>
              <tbody>
                {filteredLeave.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No leave requests.</td></tr>
                  : filteredLeave.map(r => (
                    <tr key={r.id}>
                      <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{leaveTypeLabel(r.leave_type ?? 'pto')}</span></td>
                      <td style={{ fontSize: 12.5 }}>
                        {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                        {r.is_half_day && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Half</span>}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.days_requested}</td>
                      <td><span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{r.reason ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{r.approver_note ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payroll / Payslips ── */}
      {tab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {payslipHistory.length === 0 ? (
            <div className="card">
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payroll records found. Records are created when leave is approved for this employee.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title" style={{ marginBottom: 0 }}>Payroll History</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sorted by period, newest first</div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pay Period</th>
                      <th>Monthly Salary</th>
                      <th>Leave Days</th>
                      <th>PTO Used</th>
                      <th>Deduction Days</th>
                      <th>Pay Deduction</th>
                      <th>Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslipHistory.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {p.pay_period_start} → {p.pay_period_end}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.monthly_salary)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.leave_days ?? 0) > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{p.leave_days ?? 0} days</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.pto_days_used ?? 0} days</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.shortfall_days ?? 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{(p.shortfall_days ?? 0) > 0 ? `${p.shortfall_days} days` : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.shortfall_deduction ?? 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{(p.shortfall_deduction ?? 0) > 0 ? `-$${p.shortfall_deduction!.toFixed(2)}` : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: p.net_pay != null ? 'var(--green)' : 'var(--text-muted)' }}>{fmtMoney(p.net_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Audit Trail ── */}
      {tab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 2 }}>Audit Trail</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All changes to this employee&apos;s record</p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Action</th><th>Details</th><th>When</th></tr>
              </thead>
              <tbody>
                {auditLog.length === 0
                  ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No audit records.</td></tr>
                  : auditLog.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{a.action.replace(/_/g, ' ')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(a.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: LA_TZ })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
