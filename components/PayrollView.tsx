'use client'

import { useState } from 'react'
import Link from 'next/link'

type Employee = {
  id: string
  name: string
  work_email: string
  office_location: string | null
  monthly_salary: number | null
}

type Deduction = {
  pto_days_used: number
  shortfall_days: number
  shortfall_deduction: number
  net_pay: number
} | null

type HoursMap = Record<string, number>
type LeaveMap = Record<string, number>
type PtoMap = Record<string, number>
type DeductionMap = Record<string, Deduction>

const STANDARD_MONTHLY_HOURS = 173.33

function SalaryModal({ employee, onClose, onSaved }: {
  employee: Employee
  onClose: () => void
  onSaved: (updated: Employee) => void
}) {
  const [salary, setSalary] = useState<string>(employee.monthly_salary != null ? String(employee.monthly_salary) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const value = salary !== '' ? parseFloat(salary) : null
    if (salary !== '' && (isNaN(value!) || value! < 0)) {
      setError('Enter a valid salary amount.')
      return
    }
    setSaving(true); setError('')
    const res = await fetch('/api/admin/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: employee.id, monthly_salary: value }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSaved({ ...employee, monthly_salary: data.monthly_salary })
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-title">Set Monthly Salary</div>
        <div className="modal-sub">{employee.name}</div>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Monthly Gross Salary</label>
          <input
            type="number"
            value={salary}
            onChange={e => setSalary(e.target.value)}
            className="field-input"
            placeholder="e.g. 50000"
            min="0"
            step="0.01"
            autoFocus
          />
          {salary !== '' && !isNaN(parseFloat(salary)) && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Daily rate: ${((parseFloat(salary) / STANDARD_MONTHLY_HOURS) * 8).toFixed(2)}
            </p>
          )}
        </div>
        {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Salary'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function PayrollView({ employees: initialEmployees, hoursMap, leaveMap, ptoMap, deductionMap, periodLabel }: {
  employees: Employee[]
  hoursMap: HoursMap
  leaveMap: LeaveMap
  ptoMap: PtoMap
  deductionMap: DeductionMap
  periodLabel: string
}) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null)

  const withSalary = employees.filter(e => e.monthly_salary != null)
  const totalLeave = employees.reduce((sum, e) => sum + (leaveMap[e.id] ?? 0), 0)
  const totalShortfall = withSalary.reduce((sum, e) => {
    const d = deductionMap[e.id]
    return sum + (d?.shortfall_deduction ?? 0)
  }, 0)
  const totalNetPayCalc = withSalary.reduce((sum, e) => {
    const d = deductionMap[e.id]
    return sum + (d?.net_pay ?? (e.monthly_salary ?? 0))
  }, 0)

  function handleSalarySaved(updated: Employee) {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))
    setSalaryEmployee(null)
  }

  function exportCSV() {
    const headers = [
      'Name', 'Location', 'Monthly Salary', 'Daily Rate', 'Hourly Rate',
      'Leave Days', 'PTO Balance', 'PTO Used',
      'Deduction Days', 'Pay Deduction', 'Net Pay',
    ]
    const rows = employees.map(e => {
      const d = deductionMap[e.id]
      const dailyRate = e.monthly_salary != null
        ? ((e.monthly_salary / STANDARD_MONTHLY_HOURS) * 8).toFixed(2)
        : ''
      const hourlyRate = e.monthly_salary != null ? (e.monthly_salary / STANDARD_MONTHLY_HOURS).toFixed(2) : ''
      return [
        e.name,
        e.office_location ?? '',
        e.monthly_salary ?? '',
        dailyRate,
        hourlyRate,
        leaveMap[e.id] ?? 0,
        ptoMap[e.id] ?? 0,
        d?.pto_days_used ?? '',
        d?.shortfall_days ?? '',
        d != null ? d.shortfall_deduction.toFixed(2) : '',
        d != null ? d.net_pay.toFixed(2) : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${periodLabel.replace(/\s/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {salaryEmployee && (
        <SalaryModal
          employee={salaryEmployee}
          onClose={() => setSalaryEmployee(null)}
          onSaved={handleSalarySaved}
        />
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-label">Active Staff</div>
          <div className="stat-value">{employees.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Leave Taken (Period)</div>
          <div className="stat-value" style={{ fontSize: 24, color: totalLeave > 0 ? 'var(--amber)' : 'var(--text-primary)' }}>
            {totalLeave}<span className="stat-unit">days</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pay Deductions</div>
          <div className="stat-value" style={{ fontSize: 24, color: totalShortfall > 0 ? 'var(--red)' : 'var(--text-primary)' }}>
            ${totalShortfall.toFixed(0)}<span className="stat-unit">deducted</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Pay Period Summary</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{periodLabel}</p>
          </div>
          <button onClick={exportCSV} className="btn btn-ghost" style={{ fontSize: 12.5 }}>
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Location</th>
                <th>Monthly Salary</th>
                <th>Daily Rate</th>
                <th>Hourly Rate</th>
                <th>Leave Days</th>
                <th>PTO Balance</th>
                <th>PTO Used</th>
                <th>Deduction Days</th>
                <th>Pay Deduction</th>
                <th>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0
                ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      No active employees.
                    </td>
                  </tr>
                )
                : employees.map(e => {
                  const leave = leaveMap[e.id] ?? 0
                  const pto = ptoMap[e.id] ?? 0
                  const d = deductionMap[e.id]
                  const hasSalary = e.monthly_salary != null
                  const dailyRate = hasSalary ? (e.monthly_salary! / STANDARD_MONTHLY_HOURS) * 8 : null
                  const netPay = d?.net_pay ?? null
                  const hasShortfall = d != null && d.shortfall_days > 0

                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/dashboard/admin/employees/${e.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                          {e.name}
                        </Link>
                      </td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {e.office_location ?? '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {hasSalary
                          ? `$${e.monthly_salary!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : (
                            <button
                              onClick={() => setSalaryEmployee(e)}
                              style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                            >
                              Set salary
                            </button>
                          )}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {dailyRate != null ? `$${dailyRate.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {dailyRate != null ? `$${(dailyRate / 8).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: leave > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {leave > 0 ? `${leave} days` : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                          color: pto < 2 ? 'var(--red)' : pto < 5 ? 'var(--amber)' : 'var(--green)',
                        }}>
                          {pto} days
                        </span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {d != null ? `${d.pto_days_used} days` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: hasShortfall ? 'var(--red)' : 'var(--text-muted)', fontSize: 12.5 }}>
                        {d != null ? (d.shortfall_days > 0 ? `${d.shortfall_days} days` : '—') : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: hasShortfall ? 'var(--red)' : 'var(--text-muted)', fontSize: 12.5 }}>
                        {d != null ? (d.shortfall_deduction > 0 ? `-$${d.shortfall_deduction.toFixed(2)}` : '—') : '—'}
                      </td>
                      <td style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: netPay == null
                          ? 'var(--text-muted)'
                          : hasShortfall
                            ? 'var(--amber)'
                            : 'var(--green)',
                      }}>
                        {netPay != null
                          ? `$${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : hasSalary
                            ? `$${e.monthly_salary!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
