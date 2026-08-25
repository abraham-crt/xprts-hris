'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const LA_TZ = 'America/Los_Angeles'

type Employee = { id: string; name: string; work_email: string; role: string }
type TimeEntry = {
  id: string; employee_id: string; date: string
  clock_in: string | null; clock_out: string | null
  breaks: { start: string; end: string }[]
  total_hours: number | null; is_edited: boolean; edit_note: string | null
}
type AuditEntry = { id: string; employee_id: string; action: string; details: any; performed_at: string }

function toTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LA_TZ })
}
function toDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function utcToLAInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}
function laInputToUTC(localStr: string): string {
  const [datePart, timePart] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes)
  const laParts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(utcGuess))
  const laH = parseInt(laParts.find(p => p.type === 'hour')?.value ?? '0')
  const laM = parseInt(laParts.find(p => p.type === 'minute')?.value ?? '0')
  const offsetMs = ((hours - laH) * 60 + (minutes - laM)) * 60000
  return new Date(utcGuess + offsetMs).toISOString()
}

function EditModal({ entry, employeeName, onClose, onSave }: {
  entry: TimeEntry; employeeName: string; onClose: () => void; onSave: (u: TimeEntry) => void
}) {
  const [clockIn, setClockIn] = useState(utcToLAInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(utcToLAInput(entry.clock_out))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!clockIn) { setError('Clock-in time is required.'); return }
    setSaving(true)
    const res = await fetch('/api/admin/time', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, clock_in: laInputToUTC(clockIn), clock_out: clockOut ? laInputToUTC(clockOut) : null, edit_note: note }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSave(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Edit Entry — {employeeName}</div>
        <div className="modal-sub">
          {toDate(entry.date)} · Edit will be logged in audit trail.
          <span style={{ color: 'var(--accent)', marginLeft: 6 }}>All times in PST</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label className="field-label">Clock In</label>
            <input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} className="field-input" /></div>
          <div><label className="field-label">Clock Out</label>
            <input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} className="field-input" /></div>
          <div><label className="field-label">Reason for edit</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. employee reported wrong clock-out" className="field-input" /></div>
          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function AdminTimeView({ employees, entries, edits, today }: {
  employees: Employee[]; entries: TimeEntry[]; edits: AuditEntry[]; today: string
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [allEntries, setAllEntries] = useState<TimeEntry[]>(entries)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')
  const [tab, setTab] = useState<'status' | 'entries' | 'edits'>('status')

  // Sync state when server re-renders after router.refresh()
  useEffect(() => { setAllEntries(entries) }, [entries])

  async function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1200)
  }

  const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]))

  const todayEntries = allEntries.filter(e => e.date === today)
  const clockedIn = todayEntries.filter(e => e.clock_in && !e.clock_out)
  const clockedOut = todayEntries.filter(e => e.clock_out)
  const notStarted = employees.filter(e => !todayEntries.find(t => t.employee_id === e.id))

  const filteredEntries = allEntries.filter(e =>
    selectedEmployee === 'all' || e.employee_id === selectedEmployee
  )

  function handleEditSave(updated: TimeEntry) {
    setAllEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setEditingEntry(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          employeeName={employeeMap[editingEntry.employee_id]?.name ?? 'Unknown'}
          onClose={() => setEditingEntry(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Tabs + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(['status', 'entries', 'edits'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`tab-btn ${tab === t ? 'active' : ''}`}>
              {t === 'status' ? "Today's Status" : t === 'entries' ? 'All Entries' : 'Edit Log'}
            </button>
          ))}
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Today's Status */}
      {tab === 'status' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: `Clocked In (${clockedIn.length})`, items: clockedIn, dot: 'dot-green', sub: (e: TimeEntry) => e.clock_in ? toTime(e.clock_in) : '' },
            { label: `Clocked Out (${clockedOut.length})`, items: clockedOut, dot: 'dot-gray', sub: (e: TimeEntry) => e.total_hours ? `${e.total_hours}h` : '' },
            { label: `Not Started (${notStarted.length})`, items: notStarted.map(emp => ({ id: emp.id, employee_id: emp.id } as any)), dot: 'dot-amber', sub: () => '' },
          ].map(({ label, items, dot, sub }) => (
            <div key={label} className="card">
              <div className="card-title">{label}</div>
              {items.length === 0
                ? <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>None</p>
                : items.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <span className={`dot ${dot}`} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {employeeMap[e.employee_id]?.name ?? '—'}
                    </span>
                    {sub(e) && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{sub(e)}</span>}
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      )}

      {/* All Entries */}
      {tab === 'entries' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Pay Period Entries</div>
            <select
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              className="field-input"
              style={{ marginLeft: 'auto', width: 'auto', minWidth: 180 }}
            >
              <option value="all">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Breaks</th>
                  <th>Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No entries for this period.</td></tr>
                  : filteredEntries.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{employeeMap[e.employee_id]?.name ?? '—'}</td>
                      <td>
                        {toDate(e.date)}
                        {e.is_edited && <span className="badge badge-amber" style={{ marginLeft: 8 }}>Edited</span>}
                      </td>
                      <td>{e.clock_in ? toTime(e.clock_in) : '—'}</td>
                      <td>{e.clock_out ? toTime(e.clock_out) : <span className="badge badge-green">Active</span>}</td>
                      <td style={{ fontSize: 12 }}>
                        {(e.breaks ?? []).length === 0 ? '—' : e.breaks.map((b, i) => (
                          <div key={i}>{toTime(b.start)} → {b.end ? toTime(b.end) : <span style={{ color: 'var(--amber)' }}>ongoing</span>}</div>
                        ))}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.total_hours ?? '—'}</td>
                      <td>
                        <button onClick={() => setEditingEntry(e)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Log */}
      {tab === 'edits' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 2 }}>Edit Audit Log</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All time entry edits by employees and admins</p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Entry Date</th>
                  <th>Original</th>
                  <th>Updated</th>
                  <th>Note</th>
                  <th>Edited</th>
                </tr>
              </thead>
              <tbody>
                {edits.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No edits recorded yet.</td></tr>
                  : edits.map(edit => (
                    <tr key={edit.id}>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{employeeMap[edit.employee_id]?.name ?? '—'}</td>
                      <td>{edit.details?.date ? toDate(edit.details.date) : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {edit.details?.original?.clock_in ? toTime(edit.details.original.clock_in) : '—'} → {edit.details?.original?.clock_out ? toTime(edit.details.original.clock_out) : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {edit.details?.updated?.clock_in ? toTime(edit.details.updated.clock_in) : '—'} → {edit.details?.updated?.clock_out ? toTime(edit.details.updated.clock_out) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{edit.details?.edit_note ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(edit.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: LA_TZ })}
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
