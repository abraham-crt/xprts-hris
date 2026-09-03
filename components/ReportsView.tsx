'use client'

import { useState, useMemo } from 'react'
import { leaveTypeLabel } from '@/lib/countries'

type Employee = { id: string; name: string; office_location: string | null; role: string; employment_type: string | null; monthly_salary: number | null }
type TimeEntry = { employee_id: string; date: string; clock_in: string | null; clock_out: string | null; total_hours: number | null }
type LeaveRequest = { employee_id: string; start_date: string; end_date: string; days_requested: number; leave_type: string | null; status: string; created_at: string; reviewed_at: string | null }
type PayrollDeduction = { employee_id: string; shortfall_deduction: number; net_pay: number; monthly_salary: number; pto_days_used: number; shortfall_days: number }
type SalaryRow = { id: string; monthly_salary: number | null; office_location: string | null }

const STANDARD_MONTHLY_HOURS = 173.33

function fmtH(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export function ReportsView({ employees, timeEntries, leaveRequests, payrollDeductions, salaryRows, periodStart, periodEnd, monthStart, today }: {
  employees: Employee[]
  timeEntries: TimeEntry[]
  leaveRequests: LeaveRequest[]
  payrollDeductions: PayrollDeduction[]
  salaryRows: SalaryRow[]
  periodStart: string
  periodEnd: string
  monthStart: string
  today: string
}) {
  const [tab, setTab] = useState<'attendance' | 'overtime' | 'leave' | 'payroll'>('attendance')
  const [locationFilter, setLocationFilter] = useState('all')

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))
  const locations = [...new Set(employees.map(e => e.office_location).filter(Boolean))] as string[]

  const visibleEmps = locationFilter === 'all' ? employees : employees.filter(e => e.office_location === locationFilter)
  const visibleIds = new Set(visibleEmps.map(e => e.id))

  // ── Attendance ───────────────────────────────────────────────────────────

  const attendanceRows = useMemo(() => {
    return visibleEmps.map(emp => {
      const entries = timeEntries.filter(e => e.employee_id === emp.id && e.date >= monthStart && e.date <= today)
      const daysPresent = entries.filter(e => e.clock_in).length
      const totalH = entries.reduce((s: number, e) => s + (e.total_hours ?? 0), 0)
      const daysInRange = Math.max(1, Math.ceil((new Date(today).getTime() - new Date(monthStart).getTime()) / 86400000) + 1)
      const bizDays = Math.ceil(daysInRange * 5 / 7)
      const attendance = bizDays > 0 ? Math.round((daysPresent / bizDays) * 100) : 0
      return { emp, daysPresent, bizDays, totalH, attendance }
    }).sort((a, b) => a.attendance - b.attendance)
  }, [visibleEmps, timeEntries, monthStart, today])

  // ── Overtime ─────────────────────────────────────────────────────────────

  const overtimeRows = useMemo(() => {
    return visibleEmps.map(emp => {
      const entries = timeEntries.filter(e => e.employee_id === emp.id)
      const totalH = entries.reduce((s: number, e) => s + (e.total_hours ?? 0), 0)
      const regularH = entries.reduce((s: number, e) => s + Math.min(e.total_hours ?? 0, 8), 0)
      const otH = Math.max(0, totalH - regularH)
      const daysOT = entries.filter(e => (e.total_hours ?? 0) > 8).length
      return { emp, totalH, regularH, otH, daysOT }
    }).sort((a, b) => b.otH - a.otH)
  }, [visibleEmps, timeEntries])

  // ── Leave utilization ────────────────────────────────────────────────────

  const leaveRows = useMemo(() => {
    return visibleEmps.map(emp => {
      const empLeave = leaveRequests.filter(r => r.employee_id === emp.id)
      const approved = empLeave.filter(r => r.status === 'approved')
      const pending = empLeave.filter(r => r.status === 'pending')
      const denied = empLeave.filter(r => r.status === 'denied')
      const totalApprovedDays = approved.reduce((s: number, r) => s + r.days_requested, 0)
      const byType: Record<string, number> = {}
      for (const r of approved) {
        const t = r.leave_type ?? 'pto'
        byType[t] = (byType[t] ?? 0) + r.days_requested
      }
      return { emp, approved: approved.length, pending: pending.length, denied: denied.length, totalApprovedDays, byType }
    }).sort((a, b) => b.totalApprovedDays - a.totalApprovedDays)
  }, [visibleEmps, leaveRequests])

  // Leave type breakdown (pie-like summary)
  const leaveTypeTotal: Record<string, number> = {}
  for (const r of leaveRequests.filter(r => r.status === 'approved' && visibleIds.has(r.employee_id))) {
    const t = r.leave_type ?? 'pto'
    leaveTypeTotal[t] = (leaveTypeTotal[t] ?? 0) + r.days_requested
  }

  // ── Payroll cost ─────────────────────────────────────────────────────────

  const payrollRows = useMemo(() => {
    return visibleEmps.filter(e => e.monthly_salary != null).map(emp => {
      const deduction = payrollDeductions.find(d => d.employee_id === emp.id)
      const netPay = deduction?.net_pay ?? emp.monthly_salary ?? 0
      return { emp, grossSalary: emp.monthly_salary!, netPay, deduction: deduction?.shortfall_deduction ?? 0 }
    }).sort((a, b) => b.grossSalary - a.grossSalary)
  }, [visibleEmps, payrollDeductions])

  const totalGross = payrollRows.reduce((s: number, r) => s + r.grossSalary, 0)
  const totalNet = payrollRows.reduce((s: number, r) => s + r.netPay, 0)
  const totalDed = payrollRows.reduce((s: number, r) => s + r.deduction, 0)

  // Payroll by location
  const byLocation: Record<string, number> = {}
  for (const r of payrollRows) {
    const loc = r.emp.office_location ?? 'Unknown'
    byLocation[loc] = (byLocation[loc] ?? 0) + r.grossSalary
  }

  // ── Manager turnaround ────────────────────────────────────────────────────

  const avgTurnaround = useMemo(() => {
    const reviewed = leaveRequests.filter(r => r.reviewed_at && r.status !== 'pending')
    if (reviewed.length === 0) return null
    const avg = reviewed.reduce((s: number, r) => {
      return s + (new Date(r.reviewed_at!).getTime() - new Date(r.created_at).getTime()) / 86400000
    }, 0) / reviewed.length
    return Math.round(avg * 10) / 10
  }, [leaveRequests])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="tabs" style={{ flex: 1, marginBottom: 0 }}>
          {([
            { key: 'attendance', label: 'Attendance' },
            { key: 'overtime', label: 'Overtime' },
            { key: 'leave', label: 'Leave Utilization' },
            { key: 'payroll', label: 'Payroll Cost' },
          ] as { key: typeof tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="field-input" style={{ marginBottom: 0, width: 'auto', minWidth: 150, fontSize: 12.5 }}>
          <option value="all">All Locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* ── Attendance ── */}
      {tab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="stat-card"><div className="stat-label">Employees</div><div className="stat-value">{visibleEmps.length}</div></div>
            <div className="stat-card"><div className="stat-label">Avg Attendance (month)</div><div className="stat-value" style={{ fontSize: 22 }}>{attendanceRows.length > 0 ? Math.round(attendanceRows.reduce((s: number, r) => s + r.attendance, 0) / attendanceRows.length) : 0}%</div></div>
            <div className="stat-card"><div className="stat-label">Avg Hours (month)</div><div className="stat-value" style={{ fontSize: 22 }}>{attendanceRows.length > 0 ? fmtH(Math.round(attendanceRows.reduce((s: number, r) => s + r.totalH, 0) / attendanceRows.length * 10) / 10) : '—'}</div></div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Attendance Summary — {monthStart} → {today}</div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => exportCSV('attendance-report.csv',
                ['Employee', 'Location', 'Days Present', 'Business Days', 'Attendance %', 'Total Hours'],
                attendanceRows.map(r => [r.emp.name, r.emp.office_location ?? '', r.daysPresent, r.bizDays, r.attendance, Math.round(r.totalH * 10) / 10])
              )}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Location</th><th>Days Present</th><th>Business Days</th><th>Attendance %</th><th>Total Hours</th></tr></thead>
                <tbody>
                  {attendanceRows.map(({ emp, daysPresent, bizDays, totalH, attendance }) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{emp.office_location ?? '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{daysPresent}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{bizDays}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, attendance)}%`, height: '100%', background: attendance < 60 ? 'var(--red)' : attendance < 80 ? 'var(--amber)' : 'var(--green)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: attendance < 60 ? 'var(--red)' : attendance < 80 ? 'var(--amber)' : 'var(--green)', fontWeight: 600, minWidth: 36 }}>{attendance}%</span>
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtH(Math.round(totalH * 10) / 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Overtime ── */}
      {tab === 'overtime' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="stat-card"><div className="stat-label">Employees with OT</div><div className="stat-value" style={{ color: 'var(--amber)' }}>{overtimeRows.filter(r => r.otH > 0).length}</div></div>
            <div className="stat-card"><div className="stat-label">Total OT Hours</div><div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>{fmtH(Math.round(overtimeRows.reduce((s: number, r) => s + r.otH, 0) * 10) / 10)}</div></div>
            <div className="stat-card"><div className="stat-label">Total Hours</div><div className="stat-value" style={{ fontSize: 22 }}>{fmtH(Math.round(overtimeRows.reduce((s: number, r) => s + r.totalH, 0) * 10) / 10)}</div></div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Overtime Summary — {monthStart} → {today}</div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => exportCSV('overtime-report.csv',
                ['Employee', 'Location', 'Total Hours', 'Regular Hours', 'OT Hours', 'Days with OT'],
                overtimeRows.map(r => [r.emp.name, r.emp.office_location ?? '', Math.round(r.totalH * 10) / 10, Math.round(r.regularH * 10) / 10, Math.round(r.otH * 10) / 10, r.daysOT])
              )}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Location</th><th>Total Hours</th><th>Regular</th><th>OT Hours</th><th>Days with OT</th></tr></thead>
                <tbody>
                  {overtimeRows.map(({ emp, totalH, regularH, otH, daysOT }) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{emp.office_location ?? '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtH(Math.round(totalH * 10) / 10)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtH(Math.round(regularH * 10) / 10)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: otH > 0 ? 700 : 400, color: otH > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {otH > 0 ? `+${fmtH(Math.round(otH * 10) / 10)}` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: daysOT > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{daysOT > 0 ? daysOT : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave ── */}
      {tab === 'leave' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div className="stat-card"><div className="stat-label">Total Approved Days</div><div className="stat-value" style={{ fontSize: 22 }}>{leaveRows.reduce((s: number, r) => s + r.totalApprovedDays, 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Pending Requests</div><div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>{leaveRows.reduce((s: number, r) => s + r.pending, 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Avg Turnaround</div><div className="stat-value" style={{ fontSize: 22 }}>{avgTurnaround != null ? `${avgTurnaround}d` : '—'}</div></div>
            <div className="stat-card">
              <div className="stat-label">Leave by Type</div>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Object.entries(leaveTypeTotal).map(([t, days]) => (
                  <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{leaveTypeLabel(t)}</span>
                    <span style={{ fontWeight: 600 }}>{days}d</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Leave Utilization — Year to Date</div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => exportCSV('leave-report.csv',
                ['Employee', 'Approved Requests', 'Approved Days', 'Pending', 'Denied', 'PTO Days', 'Sick Days'],
                leaveRows.map(r => [r.emp.name, r.approved, r.totalApprovedDays, r.pending, r.denied, r.byType['pto'] ?? 0, r.byType['sick'] ?? 0])
              )}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Approved</th><th>Total Days</th><th>PTO</th><th>Sick</th><th>Unpaid</th><th>Pending</th><th>Denied</th></tr></thead>
                <tbody>
                  {leaveRows.map(({ emp, approved, totalApprovedDays, byType, pending, denied }) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{approved}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: totalApprovedDays > 15 ? 'var(--amber)' : 'var(--text-primary)' }}>{totalApprovedDays}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{byType['pto'] ?? '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{byType['sick'] ?? '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{byType['unpaid'] ?? '—'}</td>
                      <td style={{ color: pending > 0 ? 'var(--amber)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pending > 0 ? pending : '—'}</td>
                      <td style={{ color: denied > 0 ? 'var(--red)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{denied > 0 ? denied : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Payroll ── */}
      {tab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="stat-card"><div className="stat-label">Total Gross</div><div className="stat-value" style={{ fontSize: 20 }}>${totalGross.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
            <div className="stat-card"><div className="stat-label">Total Deductions</div><div className="stat-value" style={{ fontSize: 20, color: totalDed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{totalDed > 0 ? `-$${totalDed.toFixed(0)}` : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Total Net Pay</div><div className="stat-value" style={{ fontSize: 20, color: 'var(--green)' }}>${totalNet.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
          </div>

          {Object.entries(byLocation).length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Payroll Cost by Location</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(byLocation).sort((a, b) => b[1] - a[1]).map(([loc, total]) => (
                  <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', minWidth: 100 }}>{loc}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((total / totalGross) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36 }}>{Math.round((total / totalGross) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Payroll Breakdown — {periodStart} → {periodEnd}</div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => exportCSV('payroll-cost-report.csv',
                ['Employee', 'Location', 'Type', 'Gross Salary', 'Hourly Rate', 'Pay Deduction', 'Net Pay'],
                payrollRows.map(r => [r.emp.name, r.emp.office_location ?? '', r.emp.employment_type ?? '', r.grossSalary, (r.grossSalary / STANDARD_MONTHLY_HOURS).toFixed(2), r.deduction.toFixed(2), r.netPay.toFixed(2)])
              )}>Export CSV</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Location</th><th>Type</th><th>Gross</th><th>Hourly Rate</th><th>Pay Deduction</th><th>Net Pay</th></tr></thead>
                <tbody>
                  {payrollRows.map(({ emp, grossSalary, netPay, deduction }) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{emp.office_location ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{emp.employment_type ?? 'full-time'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>${grossSalary.toLocaleString('en-US', { minimumFractionDigits: 0 })}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 12.5 }}>${(grossSalary / STANDARD_MONTHLY_HOURS).toFixed(2)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: deduction > 0 ? 'var(--red)' : 'var(--text-muted)', fontSize: 12.5 }}>{deduction > 0 ? `-$${deduction.toFixed(2)}` : '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--green)' }}>${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
