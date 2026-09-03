'use client'

import { useState, useRef } from 'react'
import { LEAVE_TYPES, leaveTypeLabel } from '@/lib/countries'

type LeaveRequest = {
  id: string
  start_date: string
  end_date: string
  is_half_day: boolean
  days_requested: number
  reason: string | null
  file_url: string | null
  status: string
  approver_note: string | null
  leave_type: string
  reviewed_by: string | null
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

function calcBusinessDays(start: string, end: string): number {
  if (!start || !end || start > end) return 0
  let count = 0
  const cur = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (cur <= endDate) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function LeaveForm({ initialRequests, ptoBalance }: {
  initialRequests: LeaveRequest[]
  ptoBalance: number
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'full' | 'half'>('full')
  const [leaveType, setLeaveType] = useState<string>('pto')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  const isHalf = mode === 'half'
  const days = isHalf ? 0.5 : calcBusinessDays(startDate, endDate)
  const lowBalance = days > 0 && leaveType === 'pto' && ptoBalance < days

  function resetForm() {
    setMode('full')
    setLeaveType('pto')
    setStartDate(''); setEndDate(''); setSingleDate('')
    setReason(''); setFile(null)
    setError(''); setWarning('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    setError(''); setWarning('')

    if (isHalf && !singleDate) { setError('Please select a date.'); return }
    if (!isHalf && (!startDate || !endDate)) { setError('Please select start and end dates.'); return }
    if (!isHalf && days === 0) { setError('No business days in the selected range.'); return }

    setSaving(true)

    let fileUrl: string | undefined
    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      const uploadRes = await fetch('/api/leave/upload', { method: 'POST', body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) { setError(uploadData.error ?? 'File upload failed.'); setSaving(false); return }
      fileUrl = uploadData.url
    }

    const body = {
      start_date: isHalf ? singleDate : startDate,
      end_date: isHalf ? singleDate : endDate,
      is_half_day: isHalf,
      leave_type: leaveType,
      reason: reason || undefined,
      file_url: fileUrl,
    }

    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to submit.'); setSaving(false); return }

    if (data._warning) setWarning(data._warning)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _warning: _w, ...cleanData } = data
    setRequests(prev => [cleanData as LeaveRequest, ...prev])
    setShowForm(false)
    resetForm()
    setSaving(false)
  }

  const filteredRequests = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Balance + action row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div className="stat-card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <div className="stat-label">PTO Balance</div>
            <div className="stat-value" style={{
              fontSize: 24,
              color: ptoBalance < 3 ? 'var(--amber)' : 'var(--green)',
            }}>
              {ptoBalance}<span className="stat-unit">days</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => { if (showForm) { setShowForm(false); resetForm() } else setShowForm(true) }}
          className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}
        >
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {warning && (
        <div style={{ padding: '10px 14px', background: 'var(--amber-soft)', borderRadius: 8, fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>
          {warning}
        </div>
      )}

      {/* Leave request form */}
      {showForm && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 18 }}>New Leave Request</div>

          {/* Leave type */}
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Leave Type</label>
            <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="field-input" style={{ maxWidth: 280 }}>
              {LEAVE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Full Day / Half Day toggle */}
          <div style={{ marginBottom: 18 }}>
            <label className="field-label">Leave Duration</label>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button
                onClick={() => setMode('full')}
                className={`tab-btn ${mode === 'full' ? 'active' : ''}`}
              >
                Full Day
              </button>
              <button
                onClick={() => setMode('half')}
                className={`tab-btn ${mode === 'half' ? 'active' : ''}`}
              >
                Half Day
              </button>
            </div>
          </div>

          {/* Date fields */}
          {isHalf ? (
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">Date</label>
              <input
                type="date"
                value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                className="field-input"
                style={{ maxWidth: 200 }}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label className="field-label">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); if (!endDate) setEndDate(e.target.value) }}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  min={startDate}
                  className="field-input"
                />
              </div>
            </div>
          )}

          {/* Day count preview */}
          {(isHalf ? singleDate : days > 0) && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--accent-soft)', borderRadius: 8, fontSize: 13, color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>
                {isHalf
                  ? `0.5 days · ${fmt(singleDate)}`
                  : `${days} business day${days !== 1 ? 's' : ''} · ${fmt(startDate)}${startDate !== endDate ? ` → ${fmt(endDate)}` : ''}`}
              </span>
              {lowBalance && (
                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                  ⚠ Low PTO balance ({ptoBalance} days available)
                </span>
              )}
            </div>
          )}

          {/* Reason */}
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">
              Reason <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="field-input"
              rows={2}
              style={{ resize: 'vertical' }}
              placeholder="Brief description of your leave"
            />
          </div>

          {/* File upload */}
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">
              Documentation <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="field-input"
              style={{ paddingTop: 6 }}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
            {file && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{file.name}</p>
            )}
          </div>

          {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSubmit}
              disabled={saving || (!isHalf && days === 0) || (isHalf && !singleDate)}
              className="btn btn-primary"
            >
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm() }} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Request history */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>My Requests</div>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {(['all', 'pending', 'approved', 'denied'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`tab-btn ${statusFilter === s ? 'active' : ''}`}
                style={{ textTransform: 'capitalize', fontSize: 12 }}
              >
                {s === 'all' ? `All (${requests.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${requests.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Type</th>
                <th>Days</th>
                <th>Status</th>
                <th>Approved By</th>
                <th>Note from Approver</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0
                ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      No leave requests.
                    </td>
                  </tr>
                )
                : filteredRequests.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12.5 }}>
                      {fmt(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmt(r.end_date)}` : ''}
                      {r.is_half_day && (
                        <span className="badge badge-blue" style={{ marginLeft: 8 }}>Half Day</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                        background: `${LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? '#6366f1'}18`,
                        color: LEAVE_TYPE_COLOR[r.leave_type ?? 'pto'] ?? 'var(--accent)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {leaveTypeLabel(r.leave_type ?? 'pto')}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {r.days_requested}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {r.reviewed_by ?? '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5, maxWidth: 200 }}>
                      {r.approver_note ?? '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
