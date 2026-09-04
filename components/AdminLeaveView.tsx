'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { leaveTypeLabel } from '@/lib/countries'

type Employee = { id: string; name: string; work_email: string }
type LeaveRequest = {
  id: string; employee_id: string; leave_type: string | null
  start_date: string; end_date: string; is_half_day: boolean
  days_requested: number; status: string; created_at: string
  reason: string | null; approver_note: string | null; reviewed_by: string | null; reviewed_at: string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', denied: 'badge-red',
}
const LEAVE_TYPE_COLOR: Record<string, string> = {
  pto: '#6366f1', sick: '#ef4444', unpaid: '#78716c', holiday: '#0ea5e9', emergency: '#f97316',
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AdminLeaveView({ employees, initialRequests }: {
  employees: Employee[]
  initialRequests: LeaveRequest[]
}) {
  const [empFilter, setEmpFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')
  const [approverFilter, setApproverFilter] = useState('all')
  const [dateRange, setDateRange] = useState<'all' | 'month' | 'quarter' | 'year' | 'custom'>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))
  const emailMap = Object.fromEntries(employees.map(e => [e.work_email, e]))

  const leaveTypes = [...new Set(initialRequests.map(r => r.leave_type).filter(Boolean) as string[])]
  const approverEmails = [...new Set(initialRequests.filter(r => r.reviewed_by).map(r => r.reviewed_by!))]

  const filtered = useMemo(() => {
    let base = initialRequests

    if (empFilter !== 'all') base = base.filter(r => r.employee_id === empFilter)
    if (statusFilter !== 'all') base = base.filter(r => r.status === statusFilter)
    if (leaveTypeFilter !== 'all') base = base.filter(r => r.leave_type === leaveTypeFilter)
    if (approverFilter !== 'all') base = base.filter(r => r.reviewed_by === approverFilter)
    if (search) {
      const q = search.toLowerCase()
      base = base.filter(r => {
        const e = empMap[r.employee_id]
        return e?.name.toLowerCase().includes(q) || e?.work_email.toLowerCase().includes(q)
      })
    }

    if (dateRange !== 'all') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      let from = '', to = today
      const d = new Date(today + 'T12:00:00')
      if (dateRange === 'month') {
        const [y, m] = today.split('-'); from = `${y}-${m}-01`
      } else if (dateRange === 'quarter') {
        d.setMonth(d.getMonth() - 3); from = d.toISOString().split('T')[0]
      } else if (dateRange === 'year') {
        from = `${today.split('-')[0]}-01-01`
      } else if (dateRange === 'custom') {
        from = customFrom; to = customTo
      }
      if (from) base = base.filter(r => r.start_date >= from && r.start_date <= to)
    }

    return [...base].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [initialRequests, empFilter, statusFilter, leaveTypeFilter, approverFilter, search, dateRange, customFrom, customTo, empMap])

  const counts = {
    total: initialRequests.length,
    pending: initialRequests.filter(r => r.status === 'pending').length,
    approved: initialRequests.filter(r => r.status === 'approved').length,
    denied: initialRequests.filter(r => r.status === 'denied').length,
    totalDays: initialRequests.filter(r => r.status === 'approved').reduce((s, r) => s + r.days_requested, 0),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Requests', value: counts.total, color: 'var(--text-primary)' },
          { label: 'Pending', value: counts.pending, color: 'var(--amber)' },
          { label: 'Approved', value: counts.approved, color: 'var(--green)' },
          { label: 'Denied', value: counts.denied, color: counts.denied > 0 ? 'var(--red)' : 'var(--text-muted)' },
          { label: 'Approved Days', value: counts.totalDays, color: 'var(--text-primary)', unit: 'days' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}{s.unit ? <span className="stat-unit">{s.unit}</span> : null}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: status + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {(['all', 'pending', 'approved', 'denied'] as const).map(s => {
              const n = s === 'all' ? counts.total : s === 'pending' ? counts.pending : s === 'approved' ? counts.approved : counts.denied
              return (
                <button key={s} onClick={() => setStatusFilter(s)} className={`tab-btn ${statusFilter === s ? 'active' : ''}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>({n})</span>
                </button>
              )
            })}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="field-input"
            style={{ maxWidth: 200, marginBottom: 0, fontSize: 12.5 }}
          />
        </div>
        {/* Row 2: date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Period:</span>
          {([
            { v: 'all', label: 'All Time' },
            { v: 'month', label: 'This Month' },
            { v: 'quarter', label: 'Last 3 Months' },
            { v: 'year', label: 'This Year' },
            { v: 'custom', label: 'Custom' },
          ] as const).map(opt => (
            <button key={opt.v} onClick={() => setDateRange(opt.v)} className={`tab-btn ${dateRange === opt.v ? 'active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }}>
              {opt.label}
            </button>
          ))}
          {dateRange === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="field-input" style={{ marginBottom: 0, width: 140, fontSize: 12 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} className="field-input" style={{ marginBottom: 0, width: 140, fontSize: 12 }} />
            </>
          )}
        </div>
        {/* Row 3: dropdowns */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="field-input" style={{ width: 200, marginBottom: 0, fontSize: 12.5 }}>
            <option value="all">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)} className="field-input" style={{ width: 160, marginBottom: 0, fontSize: 12.5 }}>
            <option value="all">All Leave Types</option>
            {leaveTypes.map(t => <option key={t} value={t}>{leaveTypeLabel(t)}</option>)}
          </select>
          <select value={approverFilter} onChange={e => setApproverFilter(e.target.value)} className="field-input" style={{ width: 180, marginBottom: 0, fontSize: 12.5 }}>
            <option value="all">All Approvers</option>
            {approverEmails.map(email => <option key={email} value={email}>{emailMap[email]?.name ?? email}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.filter(r => r.status === 'approved').reduce((s, r) => s + r.days_requested, 0)} approved days in view
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reviewed By</th>
                <th>Approver Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>No leave requests match your filters.</td></tr>
                : filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link href={`/dashboard/admin/employees/${r.employee_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {empMap[r.employee_id]?.name ?? '—'}
                      </Link>
                    </td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: `${LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? '#6366f1'}18`, color: LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        {leaveTypeLabel(r.leave_type ?? 'pto')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {fmt(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmt(r.end_date)}` : ''}
                      {r.is_half_day && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Half</span>}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.days_requested}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {r.reviewed_by ? (emailMap[r.reviewed_by]?.name ?? r.reviewed_by) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>{r.approver_note ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
