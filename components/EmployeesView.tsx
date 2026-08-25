'use client'

import { useState } from 'react'

type Employee = {
  id: string
  name: string
  work_email: string
  role: string
  status: string
  employment_start_date: string | null
  office_location: string | null
  monthly_salary: number | null
  approver_id: string | null
}

const ROLES = ['employee', 'approver', 'admin']
const LOCATIONS = ['philippines', 'ethiopia']
const ROLE_BADGE: Record<string, string> = {
  employee: 'badge-gray',
  approver: 'badge-blue',
  admin: 'badge-amber',
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function EmployeeModal({ employee, allEmployees, onClose, onSave }: {
  employee: Employee | null
  allEmployees: Employee[]
  onClose: () => void
  onSave: (e: Employee) => void
}) {
  const isEdit = !!employee
  const [name, setName] = useState(employee?.name ?? '')
  const [email, setEmail] = useState(employee?.work_email ?? '')
  const [role, setRole] = useState(employee?.role ?? 'employee')
  const [status, setStatus] = useState(employee?.status ?? 'active')
  const [location, setLocation] = useState(employee?.office_location ?? 'philippines')
  const [startDate, setStartDate] = useState(
    employee?.employment_start_date ?? new Date().toISOString().split('T')[0],
  )
  const [monthlySalary, setMonthlySalary] = useState<string>(
    employee?.monthly_salary != null ? String(employee.monthly_salary) : '',
  )
  const [approverId, setApproverId] = useState(employee?.approver_id ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const approvers = allEmployees.filter(e => (e.role === 'approver' || e.role === 'admin') && e.id !== employee?.id)

  async function handleSave() {
    if (!name || !email || !role || !location || !startDate) {
      setError('All required fields must be filled.')
      return
    }
    setSaving(true); setError('')

    const salaryValue = monthlySalary !== '' ? parseFloat(monthlySalary) : null
    if (monthlySalary !== '' && (isNaN(salaryValue!) || salaryValue! < 0)) {
      setError('Monthly salary must be a valid positive number.')
      setSaving(false); return
    }

    const body = isEdit
      ? {
          id: employee!.id,
          name,
          role,
          status,
          office_location: location,
          monthly_salary: salaryValue,
          approver_id: approverId || null,
        }
      : {
          name,
          work_email: email,
          role,
          office_location: location,
          employment_start_date: startDate,
          monthly_salary: salaryValue,
          approver_id: approverId || null,
        }

    const res = await fetch('/api/admin/employees', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSave(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">{isEdit ? 'Edit Employee' : 'Add Employee'}</div>
        <div className="modal-sub">
          {isEdit ? `Updating record for ${employee!.name}` : 'Create a new employee account'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">Full Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="field-input" placeholder="e.g. Maria Santos" />
            </div>

            {!isEdit && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">Work Email *</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className="field-input" placeholder="maria@xprts.com" type="email" />
              </div>
            )}

            <div>
              <label className="field-label">Role *</label>
              <select value={role} onChange={e => setRole(e.target.value)} className="field-input">
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Office Location *</label>
              <select value={location} onChange={e => setLocation(e.target.value)} className="field-input">
                {LOCATIONS.map(l => (
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </div>

            {!isEdit && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">Start Date *</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="field-input" />
              </div>
            )}

            {isEdit && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="field-input">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}

            <div>
              <label className="field-label">Monthly Salary <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                type="number"
                value={monthlySalary}
                onChange={e => setMonthlySalary(e.target.value)}
                className="field-input"
                placeholder="e.g. 50000"
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="field-label">Approver <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <select value={approverId} onChange={e => setApproverId(e.target.value)} className="field-input">
                <option value="">No approver assigned</option>
                {approvers.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function EmployeesView({ initialEmployees }: { initialEmployees: Employee[] }) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [modalEmployee, setModalEmployee] = useState<Employee | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')

  const visible = employees.filter(e => filter === 'all' || e.status === filter)
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

  function handleSave(saved: Employee) {
    setEmployees(prev => {
      const idx = prev.findIndex(e => e.id === saved.id)
      return idx >= 0 ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev]
    })
    setShowModal(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showModal && (
        <EmployeeModal
          employee={modalEmployee}
          allEmployees={employees}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, flex: 1 }}>
          <div className="stat-card">
            <div className="stat-label">Total Employees</div>
            <div className="stat-value">{employees.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{employees.filter(e => e.status === 'active').length}</div>
          </div>
        </div>
        <button
          onClick={() => { setModalEmployee(null); setShowModal(true) }}
          className="btn btn-primary"
          style={{ marginTop: 4 }}
        >
          + Add Employee
        </button>
      </div>

      <div className="tabs">
        {(['active', 'inactive', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`tab-btn ${filter === f ? 'active' : ''}`} style={{ textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Location</th>
                <th>Start Date</th>
                <th>Monthly Salary</th>
                <th>Approver</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      No employees found.
                    </td>
                  </tr>
                )
                : visible.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{e.work_email}</td>
                    <td><span className={`badge ${ROLE_BADGE[e.role] ?? 'badge-gray'}`}>{e.role}</span></td>
                    <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{e.office_location ?? '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {e.employment_start_date ? fmt(e.employment_start_date) : '—'}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {e.monthly_salary != null
                        ? `$${e.monthly_salary.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {e.approver_id ? (empMap[e.approver_id]?.name ?? '—') : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                    </td>
                    <td><span className={`badge ${e.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{e.status}</span></td>
                    <td>
                      <button
                        onClick={() => { setModalEmployee(e); setShowModal(true) }}
                        style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
