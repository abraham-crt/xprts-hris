'use client'

import { useState } from 'react'

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
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber',
  approved: 'badge-green',
  denied: 'badge-red',
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const [tab, setTab] = useState<'pending' | 'all'>('pending')

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))
  const pending = requests.filter(r => r.status === 'pending')
  const visible = tab === 'pending' ? pending : requests

  function handleDone(updated: LeaveRequest) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setReviewing(null)
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Pending', count: requests.filter(r => r.status === 'pending').length, color: 'var(--amber)' },
          { label: 'Approved', count: requests.filter(r => r.status === 'approved').length, color: 'var(--green)' },
          { label: 'Denied', count: requests.filter(r => r.status === 'denied').length, color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button onClick={() => setTab('pending')} className={`tab-btn ${tab === 'pending' ? 'active' : ''}`}>
          Pending{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button onClick={() => setTab('all')} className={`tab-btn ${tab === 'all' ? 'active' : ''}`}>
          All Requests
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Submitted</th>
                {tab === 'pending' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? (
                  <tr>
                    <td colSpan={tab === 'pending' ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      {tab === 'pending' ? 'No pending requests.' : 'No leave requests yet.'}
                    </td>
                  </tr>
                )
                : visible.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {empMap[r.employee_id]?.name ?? '—'}
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
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
