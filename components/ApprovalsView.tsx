'use client'

import { useState, useMemo } from 'react'
import { leaveTypeLabel } from '@/lib/countries'

type Employee = { id: string; name: string; work_email: string }
type LeaveRequest = {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  is_half_day: boolean
  days_requested: number
  reason: string | null
  status: string
  approver_note: string | null
  leave_type: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber',
  approved: 'badge-green',
  denied: 'badge-red',
}

const LEAVE_TYPE_COLOR: Record<string, string> = {
  pto: '#6366f1',
  sick: '#ef4444',
  unpaid: '#78716c',
  holiday: '#0ea5e9',
  emergency: '#f97316',
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ageDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.floor(ms / 86400000)
}

function AgeBadge({ days }: { days: number }) {
  if (days < 2) return null
  const color = days >= 6 ? 'var(--red)' : 'var(--amber)'
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
      background: days >= 6 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
      color, marginLeft: 6,
    }}>
      {days}d
    </span>
  )
}

function ActionModal({ request, employeeName, onClose, onDone }: {
  request: LeaveRequest
  employeeName: string
  onClose: () => void
  onDone: (updated: LeaveRequest) => void
}) {
  const [action, setAction] = useState<'approve' | 'deny'>('approve')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true); setError('')
    const res = await fetch('/api/approvals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, action, note }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed.'); setSaving(false); return }
    onDone(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Review Leave Request</div>
        <div className="modal-sub">
          {employeeName} · {request.days_requested} day{request.days_requested !== 1 ? 's' : ''}
          {request.is_half_day ? ' (Half Day)' : ''}
          {request.leave_type && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 4, fontWeight: 700,
              background: `${LEAVE_TYPE_COLOR[request.leave_type] ?? '#6366f1'}18`,
              color: LEAVE_TYPE_COLOR[request.leave_type] ?? 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: 8,
            }}>
              {leaveTypeLabel(request.leave_type)}
            </span>
          )}
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Period: </span>
              <strong>{fmt(request.start_date)}{request.start_date !== request.end_date ? ` → ${fmt(request.end_date)}` : ''}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Days: </span>
              <strong>{request.days_requested}</strong>
            </div>
          </div>
          {request.reason && (
            <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reason: </span>{request.reason}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['approve', 'deny'] as const).map(a => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`btn ${action === a ? (a === 'approve' ? 'btn-green' : 'btn-red') : 'btn-ghost'}`}
              style={{ flex: 1, textTransform: 'capitalize' }}
            >
              {a}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Note to employee <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            className="field-input"
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="e.g. Approved — enjoy your time off"
          />
        </div>

        {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={submit}
            disabled={saving}
            className={`btn ${action === 'approve' ? 'btn-green' : 'btn-red'}`}
            style={{ flex: 1 }}
          >
            {saving ? 'Saving…' : action === 'approve' ? 'Approve Request' : 'Deny Request'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function ApprovalsView({ employees, initialRequests }: {
  employees: Employee[]
  initialRequests: LeaveRequest[]
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'days_asc' | 'days_desc'>('oldest')
  const [approverFilter, setApproverFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

  const pending = requests.filter(r => r.status === 'pending')

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const weekAgoMs = Date.now() - 7 * 86400000
  const monthStart = (() => {
    const [y, m] = todayStr.split('-')
    return `${y}-${m}-01`
  })()

  const pendingToday = useMemo(() => {
    return pending.filter(r => r.created_at.startsWith(todayStr))
  }, [pending, todayStr])

  const approvedThisWeek = useMemo(() => {
    return requests.filter(r => r.status === 'approved' && new Date(r.reviewed_at ?? r.created_at).getTime() >= weekAgoMs)
  }, [requests, weekAgoMs])

  const approvedThisMonth = useMemo(() => {
    return requests.filter(r => r.status === 'approved' && (r.reviewed_at ?? r.created_at) >= monthStart)
  }, [requests, monthStart])

  const deniedThisMonth = useMemo(() => {
    return requests.filter(r => r.status === 'denied' && (r.reviewed_at ?? r.created_at) >= monthStart)
  }, [requests, monthStart])

  const filtered = useMemo(() => {
    let base = tab === 'pending' ? pending
      : tab === 'approved' ? requests.filter(r => r.status === 'approved')
      : tab === 'denied' ? requests.filter(r => r.status === 'denied')
      : requests

    if (search) {
      const q = search.toLowerCase()
      base = base.filter(r => {
        const emp = empMap[r.employee_id]
        return emp?.name.toLowerCase().includes(q) || emp?.work_email.toLowerCase().includes(q)
      })
    }

    if (approverFilter !== 'all') {
      base = base.filter(r => r.reviewed_by === approverFilter)
    }

    return [...base].sort((a, b) => {
      if (sortOrder === 'days_asc') return a.days_requested - b.days_requested
      if (sortOrder === 'days_desc') return b.days_requested - a.days_requested
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortOrder === 'oldest' ? cmp : -cmp
    })
  }, [requests, tab, search, sortOrder, approverFilter, empMap, pending])

  function handleDone(updated: LeaveRequest) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setReviewing(null)
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return
    setBulkSaving(true)
    const ids = [...selected]
    await Promise.all(ids.map(id =>
      fetch('/api/approvals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, action: 'approve', note: '' }),
      }).then(r => r.json()).then(updated => {
        setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
      })
    ))
    setSelected(new Set())
    setBulkSaving(false)
  }

  const approverNames = [...new Set(
    requests.filter(r => r.reviewed_by).map(r => r.reviewed_by!)
  )]

  const tabCounts = {
    pending: pending.length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length,
    all: requests.length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {reviewing && (
        <ActionModal
          request={reviewing}
          employeeName={empMap[reviewing.employee_id]?.name ?? 'Unknown'}
          onClose={() => setReviewing(null)}
          onDone={handleDone}
        />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Pending', count: tabCounts.pending, color: 'var(--amber)', sub: `${pendingToday.length} submitted today` },
          { label: 'Approved This Week', count: approvedThisWeek.length, color: 'var(--green)', sub: null },
          { label: 'Approved This Month', count: approvedThisMonth.length, color: 'var(--green)', sub: null },
          { label: 'Denied This Month', count: deniedThisMonth.length, color: deniedThisMonth.length > 0 ? 'var(--red)' : 'var(--text-muted)', sub: null },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.count}</div>
            {s.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(['pending', 'approved', 'denied', 'all'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected(new Set()) }} className={`tab-btn ${tab === t ? 'active' : ''}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {tabCounts[t] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({tabCounts[t]})</span>}
            </button>
          ))}
        </div>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
          className="field-input"
          style={{ width: 150, marginBottom: 0, fontSize: 12.5 }}
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
          <option value="days_desc">Most days first</option>
          <option value="days_asc">Fewest days first</option>
        </select>
        <select
          value={approverFilter}
          onChange={e => setApproverFilter(e.target.value)}
          className="field-input"
          style={{ width: 150, marginBottom: 0, fontSize: 12.5 }}
        >
          <option value="all">All Approvers</option>
          {approverNames.map(n => <option key={n} value={n}>{empMap[n]?.name ?? n}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="field-input"
          style={{ maxWidth: 180, marginBottom: 0, fontSize: 12.5 }}
        />
        {tab === 'pending' && selected.size > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkSaving}
            className="btn btn-green"
            style={{ fontSize: 12.5, padding: '6px 14px', whiteSpace: 'nowrap' }}
          >
            {bulkSaving ? 'Approving…' : `Approve ${selected.size} selected`}
          </button>
        )}
      </div>

      {/* Aging notice for pending */}
      {tab === 'pending' && pending.filter(r => ageDays(r.created_at) >= 2).length > 0 && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.1)', borderRadius: 8, fontSize: 12.5, color: 'var(--amber)', fontWeight: 500 }}>
          {pending.filter(r => ageDays(r.created_at) >= 6).length > 0 && (
            <span style={{ color: 'var(--red)' }}>
              {pending.filter(r => ageDays(r.created_at) >= 6).length} request{pending.filter(r => ageDays(r.created_at) >= 6).length !== 1 ? 's' : ''} waiting 6+ days.{' '}
            </span>
          )}
          Badges show days waiting — amber = 2–5 days, red = 6+ days.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {tab === 'pending' && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                      onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th>Employee</th>
                <th>Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Submitted</th>
                {tab === 'pending' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={tab === 'pending' ? 9 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      {search ? 'No requests match your search.' : tab === 'pending' ? 'No pending requests.' : 'No requests.'}
                    </td>
                  </tr>
                )
                : filtered.map(r => {
                  const age = ageDays(r.created_at)
                  return (
                    <tr key={r.id}>
                      {tab === 'pending' && (
                        <td style={{ width: 32 }}>
                          {r.status === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={e => setSelected(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(r.id); else next.delete(r.id)
                                return next
                              })}
                              style={{ cursor: 'pointer' }}
                            />
                          )}
                        </td>
                      )}
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                        {empMap[r.employee_id]?.name ?? '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                          background: `${LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? '#6366f1'}18`,
                          color: LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? 'var(--accent)',
                          textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        }}>
                          {leaveTypeLabel(r.leave_type ?? 'pto')}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {fmt(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmt(r.end_date)}` : ''}
                        {r.is_half_day && (
                          <span className="badge badge-blue" style={{ marginLeft: 6 }}>Half Day</span>
                        )}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.days_requested}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12.5, maxWidth: 160 }}>{r.reason ?? '—'}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span>
                        {r.approver_note && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.approver_note}</div>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {r.status === 'pending' && <AgeBadge days={age} />}
                      </td>
                      {tab === 'pending' && (
                        <td>
                          {r.status === 'pending' && (
                            <button
                              onClick={() => setReviewing(r)}
                              className="btn btn-primary"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                            >
                              Review
                            </button>
                          )}
                        </td>
                      )}
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
