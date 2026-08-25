'use client'

import { useState, useEffect } from 'react'

const LA_TZ = 'America/Los_Angeles'

type Break = { start: string; end: string }
type TimeEntry = {
  id: string; date: string
  clock_in: string | null; clock_out: string | null
  breaks: Break[]; total_hours: number | null
  is_edited: boolean; edit_note: string | null
}

function toTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LA_TZ })
}

function toDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

function isLocked(dateStr: string) {
  const today = new Date()
  if (today.getDate() < 25) return false
  const entry = new Date(dateStr + 'T12:00:00')
  const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 26)
  const periodEnd = new Date(today.getFullYear(), today.getMonth(), 25)
  return entry >= periodStart && entry <= periodEnd
}

function getStatus(entry: TimeEntry | null) {
  if (!entry?.clock_in) return 'not_started'
  if (entry.clock_out) return 'clocked_out'
  const last = (entry.breaks ?? []).at(-1)
  if (last && !last.end) return 'on_break'
  return 'clocked_in'
}

function EditStartTimeModal({ entry, onClose, onSave }: { entry: TimeEntry; onClose: () => void; onSave: (u: TimeEntry) => void }) {
  const [clockIn, setClockIn] = useState(utcToLAInput(entry.clock_in))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!clockIn) { setError('Start time is required.'); return }
    setSaving(true)
    const res = await fetch('/api/time', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, clock_in: laInputToUTC(clockIn), clock_out: null }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSave(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="modal-title">Edit Start Time</div>
        <div className="modal-sub">Adjust your clock-in time for today · <span style={{ color: 'var(--accent)' }}>PST</span></div>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Clock In</label>
          <input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} className="field-input" autoFocus />
        </div>
        {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EditModal({ entry, onClose, onSave }: { entry: TimeEntry; onClose: () => void; onSave: (u: TimeEntry) => void }) {
  const [clockIn, setClockIn] = useState(utcToLAInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(utcToLAInput(entry.clock_out))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!clockIn) { setError('Clock-in time is required.'); return }
    setSaving(true)
    const res = await fetch('/api/time', {
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
        <div className="modal-title">Edit Time Entry</div>
        <div className="modal-sub">
          {toDate(entry.date)} · This edit will be flagged for admin review.
          <span style={{ color: 'var(--accent)', marginLeft: 6 }}>All times in PST</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Clock In</label>
            <input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} className="field-input" />
          </div>
          <div>
            <label className="field-label">Clock Out</label>
            <input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} className="field-input" />
          </div>
          <div>
            <label className="field-label">Reason for edit</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. forgot to clock out" className="field-input" />
          </div>
          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function TimeTracker({ employeeId, todayEntry, recentEntries }: {
  employeeId: string; todayEntry: TimeEntry | null; recentEntries: TimeEntry[]
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(todayEntry)
  const [entries, setEntries] = useState<TimeEntry[]>(recentEntries)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState('00:00:00')
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editingStart, setEditingStart] = useState(false)

  const status = getStatus(entry)

  useEffect(() => {
    if (status !== 'clocked_in' && status !== 'on_break') return
    const interval = setInterval(() => {
      if (!entry?.clock_in) return
      const breaks = entry.breaks ?? []
      const breakMs = breaks.reduce((acc, b) => {
        if (b.start && b.end) return acc + (new Date(b.end).getTime() - new Date(b.start).getTime())
        if (b.start && !b.end) return acc + (Date.now() - new Date(b.start).getTime())
        return acc
      }, 0)
      const totalMs = Math.max(0, Date.now() - new Date(entry.clock_in).getTime() - breakMs)
      const h = Math.floor(totalMs / 3600000)
      const m = Math.floor((totalMs % 3600000) / 60000)
      const s = Math.floor((totalMs % 60000) / 1000)
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [entry, status])

  async function doAction(action: string) {
    setLoading(true)
    const res = await fetch('/api/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const data = await res.json()
    if (res.ok) {
      setEntry(data)
      setEntries(prev => {
        const idx = prev.findIndex(e => e.id === data.id)
        return idx >= 0 ? prev.map(e => e.id === data.id ? data : e) : [data, ...prev]
      })
    }
    setLoading(false)
  }

  function handleEditSave(updated: TimeEntry) {
    if (updated.date === new Date().toISOString().split('T')[0]) setEntry(updated)
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setEditingEntry(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {editingEntry && <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={handleEditSave} />}
      {editingStart && entry && <EditStartTimeModal entry={entry} onClose={() => setEditingStart(false)} onSave={u => { setEntry(u); setEditingStart(false) }} />}

      {/* Clock card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {toDate(new Date().toISOString().split('T')[0])} · PST
            </div>
            {(status === 'clocked_in' || status === 'on_break') ? (
              <div className="clock-display" style={{ color: status === 'on_break' ? 'var(--amber)' : 'var(--text-primary)' }}>
                {elapsed}
              </div>
            ) : status === 'clocked_out' ? (
              <div className="clock-display">{entry?.total_hours}<span style={{ fontSize: 20, color: 'var(--text-muted)', marginLeft: 6 }}>hrs</span></div>
            ) : (
              <div className="clock-display" style={{ color: 'var(--text-muted)' }}>--:--:--</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 2 }}>
            {entry?.clock_in && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <span>In: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_in)}</strong></span>
                {(status === 'clocked_in' || status === 'on_break') && (
                  <button
                    onClick={() => setEditingStart(true)}
                    title="Edit start time"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 2px', lineHeight: 1, fontSize: 11, fontWeight: 600 }}
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
            {entry?.clock_out && <div>Out: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_out)}</strong></div>}
            {status === 'on_break' && <span className="badge badge-amber">On break</span>}
            {status === 'clocked_in' && <span className="badge badge-green">Active</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {status === 'not_started' && (
            <button onClick={() => doAction('clock_in')} disabled={loading} className="btn btn-green">Clock In</button>
          )}
          {status === 'clocked_in' && (
            <>
              <button onClick={() => doAction('start_break')} disabled={loading} className="btn btn-amber">Start Break</button>
              <button onClick={() => doAction('clock_out')} disabled={loading} className="btn btn-red">Clock Out</button>
            </>
          )}
          {status === 'on_break' && (
            <button onClick={() => doAction('end_break')} disabled={loading} className="btn btn-primary">Resume</button>
          )}
          {status === 'clocked_out' && entry && !isLocked(entry.date) && (
            <button onClick={() => setEditingEntry(entry)} className="btn btn-ghost">Edit Today's Entry</button>
          )}
          {status === 'clocked_out' && entry && isLocked(entry.date) && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>Pay period locked — no further edits.</span>
          )}
        </div>

        {(entry?.breaks ?? []).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Breaks</div>
            {entry!.breaks.map((b, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {toTime(b.start)} → {b.end ? toTime(b.end) : <span style={{ color: 'var(--amber)' }}>ongoing</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Recent Days</div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Breaks</th>
                  <th>Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{toDate(e.date)}</span>
                      {e.is_edited && <span className="badge badge-amber" style={{ marginLeft: 8 }}>Edited</span>}
                    </td>
                    <td>{e.clock_in ? toTime(e.clock_in) : '—'}</td>
                    <td>{e.clock_out ? toTime(e.clock_out) : '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {(e.breaks ?? []).length === 0 ? '—' : e.breaks.map((b, i) => (
                        <div key={i}>{toTime(b.start)} → {b.end ? toTime(b.end) : <span style={{ color: 'var(--amber)' }}>ongoing</span>}</div>
                      ))}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.total_hours ?? '—'}</td>
                    <td>
                      {e.clock_out && !isLocked(e.date)
                        ? <button onClick={() => setEditingEntry(e)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>
                        : isLocked(e.date) ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Locked</span> : null}
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
