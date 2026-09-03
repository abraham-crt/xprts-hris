'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const LA_TZ = 'America/Los_Angeles'

type Employee = { id: string; name: string; work_email: string; role: string }
type TimeEntry = {
  id: string; employee_id: string; date: string
  clock_in: string | null; clock_out: string | null
  breaks: { start: string; end: string | null }[]
  total_hours: number | null; is_edited: boolean; edit_note: string | null
}
type AuditEntry = { id: string; employee_id: string; action: string; details: Record<string, unknown>; performed_at: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function laTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LA_TZ })
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function dayLabel(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

function breakMins(breaks: { start: string; end: string | null }[]): number {
  return (breaks ?? []).reduce((s, b) => {
    if (!b.end) return s
    return s + Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000)
  }, 0)
}

function entryHours(e: TimeEntry, nowMs: number): number | null {
  if (e.total_hours != null) return e.total_hours
  if (e.clock_in && !e.clock_out) {
    return Math.round((nowMs - new Date(e.clock_in).getTime()) / 360000) / 10
  }
  return null
}

function otH(h: number) { return Math.max(0, Math.round((h - 8) * 10) / 10) }

function isLate(ci: string) {
  const t = new Date(ci).toLocaleTimeString('en-US', { timeZone: LA_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
  const [h, m] = t.split(':').map(Number)
  return h > 9 || (h === 9 && m > 30)
}

function fmtH(h: number | null) {
  if (h == null) return '—'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function genDays(from: string, to: string): string[] {
  const days: string[] = []
  const d = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (d <= end) {
    days.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return days
}

function bizDays(days: string[]): number {
  return days.filter(d => { const wd = new Date(d + 'T12:00:00').getDay(); return wd !== 0 && wd !== 6 }).length
}

function onBreak(e: TimeEntry): boolean {
  const bs = e.breaks ?? []
  return bs.length > 0 && !bs[bs.length - 1].end
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

// ── EditModal ─────────────────────────────────────────────────────────────────

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
    if (!res.ok) { setError(data.error ?? 'Failed.'); setSaving(false); return }
    onSave(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Edit Entry — {employeeName}</div>
        <div className="modal-sub">{fmtDate(entry.date)} · Edit is logged in audit trail. <span style={{ color: 'var(--accent)' }}>All times in PST</span></div>
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
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Status badge helper ───────────────────────────────────────────────────────

function StatusBadge({ entry, today, nowMs }: { entry?: TimeEntry; today: string; nowMs: number }) {
  if (!entry) return <span className="badge badge-gray">Not Started</span>
  if (onBreak(entry)) return <span className="badge badge-blue">On Break</span>
  if (!entry.clock_out) {
    const h = entryHours(entry, nowMs)
    return <span className="badge badge-green">{h != null ? `${fmtH(h)}` : 'Clocked In'}</span>
  }
  return <span className="badge badge-gray">Clocked Out</span>
}

// ── AdminTimeView ─────────────────────────────────────────────────────────────

export function AdminTimeView({ employees, entries, edits, today, yesterday, weekStart, monthStart }: {
  employees: Employee[]
  entries: TimeEntry[]
  edits: AuditEntry[]
  today: string
  yesterday: string
  weekStart: string
  monthStart: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'today' | 'yesterday' | 'weekly' | 'monthly' | 'edits'>('today')
  const [nowMs, setNowMs] = useState(Date.now())
  const [allEntries, setAllEntries] = useState<TimeEntry[]>(entries)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [empFilter, setEmpFilter] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { setAllEntries(entries) }, [entries])

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

  // Index entries: byEmpDate[empId][date] = TimeEntry
  const byEmpDate: Record<string, Record<string, TimeEntry>> = {}
  for (const e of allEntries) {
    if (!byEmpDate[e.employee_id]) byEmpDate[e.employee_id] = {}
    byEmpDate[e.employee_id][e.date] = e
  }

  // Missing clock-outs from past days (not today)
  const missingPunchEmpIds = new Set(
    allEntries.filter(e => e.date < today && e.clock_in && !e.clock_out).map(e => e.employee_id)
  )

  const weekDays = genDays(weekStart, today)
  const monthDays = genDays(monthStart, today)
  const monthBizDays = bizDays(monthDays)

  const visibleEmps = empFilter === 'all' ? employees : employees.filter(e => e.id === empFilter)

  async function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1200)
  }

  // ── Today ─────────────────────────────────────────────────────────────────

  function renderToday() {
    const todayEntries = employees.map(emp => ({
      emp,
      entry: byEmpDate[emp.id]?.[today] ?? null,
    }))

    const clockedInCount = todayEntries.filter(({ entry }) => entry?.clock_in && !entry.clock_out).length
    const clockedOutCount = todayEntries.filter(({ entry }) => entry?.clock_out).length
    const notStartedCount = todayEntries.filter(({ entry }) => !entry).length
    const totalWorked = todayEntries.reduce((s, { entry }) => {
      const h = entry ? entryHours(entry, nowMs) : null
      return s + (h ?? 0)
    }, 0)

    // OT today
    const otToday = todayEntries.filter(({ entry }) => {
      const h = entry ? entryHours(entry, nowMs) : null
      return h != null && h > 8
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Clocked In', value: clockedInCount, color: 'var(--green)' },
            { label: 'Clocked Out', value: clockedOutCount, color: 'var(--text-muted)' },
            { label: 'Not Started', value: notStartedCount, color: 'var(--amber)' },
            { label: 'Total Worked', value: fmtH(Math.round(totalWorked * 10) / 10), color: 'var(--text-primary)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 22, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Today table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Break</th>
                  <th>Hours</th>
                  <th>OT</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(empFilter === 'all' ? employees : [empMap[empFilter]].filter(Boolean)).map(emp => {
                  const entry = byEmpDate[emp.id]?.[today] ?? null
                  const h = entry ? entryHours(entry, nowMs) : null
                  const ot = h != null ? otH(h) : 0
                  const bm = entry ? breakMins(entry.breaks ?? []) : 0
                  const late = entry?.clock_in ? isLate(entry.clock_in) : false
                  const hasMissingPunch = missingPunchEmpIds.has(emp.id)
                  const isActive = entry?.clock_in && !entry.clock_out
                  return (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                      <td><StatusBadge entry={entry ?? undefined} today={today} nowMs={nowMs} /></td>
                      <td style={{ fontSize: 12.5, color: late ? 'var(--amber)' : 'var(--text-primary)' }}>
                        {entry?.clock_in ? laTime(entry.clock_in) : '—'}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                        {entry?.clock_out ? laTime(entry.clock_out) : (isActive ? <span className="badge badge-green">Active</span> : '—')}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                        {bm > 0 ? `${bm}m` : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: isActive ? 'var(--green)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtH(h)}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: ot > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: ot > 0 ? 600 : 400 }}>
                        {ot > 0 ? `+${fmtH(ot)}` : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {late && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', fontWeight: 700 }}>LATE</span>}
                          {hasMissingPunch && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', fontWeight: 700 }}>OPEN ENTRY</span>}
                          {ot > 2 && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', fontWeight: 700 }}>OT</span>}
                        </div>
                      </td>
                      <td>
                        {entry && (
                          <button onClick={() => setEditingEntry(entry)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* OT Panel */}
        {otToday.length > 0 && (
          <div className="card" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
            <div className="card-title" style={{ color: 'var(--amber)', marginBottom: 10 }}>⚠ Overtime Today</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {otToday.map(({ emp, entry }) => {
                const h = entryHours(entry!, nowMs)
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtH(h)} (+{fmtH(otH(h!))})</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Yesterday ─────────────────────────────────────────────────────────────

  function renderYesterday() {
    const rows = employees.map(emp => {
      const entry = byEmpDate[emp.id]?.[yesterday] ?? null
      const h = entry ? entryHours(entry, nowMs) : null
      const ot = h != null ? otH(h) : 0
      const bm = entry ? breakMins(entry.breaks ?? []) : 0
      let status = 'No Entry'
      if (entry?.clock_out) status = 'Completed'
      else if (entry?.clock_in) status = 'Missing Punch'
      return { emp, entry, h, ot, bm, status }
    })

    const completed = rows.filter(r => r.status === 'Completed').length
    const missing = rows.filter(r => r.status === 'Missing Punch').length
    const noEntry = rows.filter(r => r.status === 'No Entry').length
    const totalH = rows.reduce((s, r) => s + (r.h ?? 0), 0)
    const totalOT = rows.reduce((s, r) => s + r.ot, 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: 'Completed', value: completed, color: 'var(--green)' },
            { label: 'Missing Punch', value: missing, color: 'var(--red)' },
            { label: 'No Entry', value: noEntry, color: 'var(--text-muted)' },
            { label: 'Total Hours', value: fmtH(Math.round(totalH * 10) / 10), color: 'var(--text-primary)' },
            { label: 'OT Hours', value: fmtH(Math.round(totalOT * 10) / 10), color: totalOT > 0 ? 'var(--amber)' : 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 20, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Break</th>
                  <th>Hours</th>
                  <th>OT</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(empFilter === 'all' ? rows : rows.filter(r => r.emp.id === empFilter)).map(({ emp, entry, h, ot, bm, status }) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                    <td style={{ fontSize: 12.5 }}>{entry?.clock_in ? laTime(entry.clock_in) : '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{entry?.clock_out ? laTime(entry.clock_out) : '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{bm > 0 ? `${bm}m` : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtH(h)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: ot > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: ot > 0 ? 600 : 400 }}>
                      {ot > 0 ? `+${fmtH(ot)}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${status === 'Completed' ? 'badge-green' : status === 'Missing Punch' ? 'badge-red' : 'badge-gray'}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      {entry && <button onClick={() => setEditingEntry(entry)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* OT Panel Yesterday */}
        {rows.filter(r => r.ot > 0).length > 0 && (
          <div className="card" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
            <div className="card-title" style={{ color: 'var(--amber)', marginBottom: 10 }}>⚠ Overtime Yesterday — {fmtDate(yesterday)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {rows.filter(r => r.ot > 0).sort((a, b) => b.ot - a.ot).map(({ emp, h, ot }) => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtH(h)} (+{fmtH(ot)})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Weekly ────────────────────────────────────────────────────────────────

  function renderWeekly() {
    const rows = employees.map(emp => {
      const dayHours = weekDays.map(d => {
        const e = byEmpDate[emp.id]?.[d]
        return e ? entryHours(e, nowMs) : null
      })
      const total = dayHours.reduce((s: number, h) => s + (h ?? 0), 0)
      const totalOT = dayHours.reduce((s: number, h) => s + (h != null ? otH(h) : 0), 0)
      const daysPresent = dayHours.filter(h => h != null).length
      return { emp, dayHours, total, totalOT, daysPresent }
    })

    const grandTotal = rows.reduce((s: number, r) => s + r.total, 0)
    const grandOT = rows.reduce((s: number, r) => s + r.totalOT, 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div className="stat-card"><div className="stat-label">Total Hours</div><div className="stat-value" style={{ fontSize: 22 }}>{fmtH(Math.round(grandTotal * 10) / 10)}</div></div>
          <div className="stat-card"><div className="stat-label">OT Hours</div><div className="stat-value" style={{ fontSize: 22, color: grandOT > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmtH(Math.round(grandOT * 10) / 10)}</div></div>
          <div className="stat-card"><div className="stat-label">Days Tracked</div><div className="stat-value" style={{ fontSize: 22 }}>{weekDays.length}</div></div>
          <div className="stat-card"><div className="stat-label">Period</div><div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtDate(weekDays[0])} → {fmtDate(weekDays[weekDays.length - 1])}</div></div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {weekDays.map(d => (
                    <th key={d} style={{ textAlign: 'center', minWidth: 64 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{dayLabel(d)}</div>
                      <div style={{ fontSize: 11 }}>{fmtDate(d)}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>OT</th>
                </tr>
              </thead>
              <tbody>
                {(empFilter === 'all' ? rows : rows.filter(r => r.emp.id === empFilter)).map(({ emp, dayHours, total, totalOT }) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                    {dayHours.map((h, i) => (
                      <td key={i} style={{
                        textAlign: 'center', fontSize: 12.5, fontVariantNumeric: 'tabular-nums',
                        color: h == null ? 'var(--text-muted)' : h > 8 ? 'var(--amber)' : h < 4 ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontWeight: h != null && h > 8 ? 600 : 400,
                      }}>
                        {h != null ? fmtH(Math.round(h * 10) / 10) : '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(Math.round(total * 10) / 10)}</td>
                    <td style={{ textAlign: 'center', color: totalOT > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: totalOT > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                      {totalOT > 0 ? `+${fmtH(Math.round(totalOT * 10) / 10)}` : '—'}
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

  // ── Monthly ───────────────────────────────────────────────────────────────

  function renderMonthly() {
    const rows = employees.map(emp => {
      const empEntries = monthDays.map(d => byEmpDate[emp.id]?.[d] ?? null)
      const total = empEntries.reduce((s: number, e) => s + (e ? (entryHours(e, nowMs) ?? 0) : 0), 0)
      const regularHrs = empEntries.reduce((s: number, e) => {
        const h = e ? entryHours(e, nowMs) : null
        return s + (h != null ? Math.min(8, h) : 0)
      }, 0)
      const totalOT = Math.max(0, total - regularHrs)
      const daysPresent = empEntries.filter(e => e?.clock_in).length
      const attendance = monthBizDays > 0 ? Math.round((daysPresent / monthBizDays) * 100) : 0
      return { emp, total, regularHrs, totalOT, daysPresent, attendance }
    })

    const grandTotal = rows.reduce((s: number, r) => s + r.total, 0)
    const grandOT = rows.reduce((s: number, r) => s + r.totalOT, 0)
    const avgAtt = rows.length > 0 ? Math.round(rows.reduce((s: number, r) => s + r.attendance, 0) / rows.length) : 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div className="stat-card"><div className="stat-label">Total Hours</div><div className="stat-value" style={{ fontSize: 22 }}>{fmtH(Math.round(grandTotal * 10) / 10)}</div></div>
          <div className="stat-card"><div className="stat-label">OT Hours</div><div className="stat-value" style={{ fontSize: 22, color: grandOT > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmtH(Math.round(grandOT * 10) / 10)}</div></div>
          <div className="stat-card"><div className="stat-label">Business Days</div><div className="stat-value" style={{ fontSize: 22 }}>{monthBizDays}</div></div>
          <div className="stat-card"><div className="stat-label">Avg Attendance</div><div className="stat-value" style={{ fontSize: 22, color: avgAtt < 80 ? 'var(--amber)' : 'var(--green)' }}>{avgAtt}%</div></div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Days In</th>
                  <th>Biz Days</th>
                  <th>Attendance</th>
                  <th>Total Hours</th>
                  <th>Regular</th>
                  <th>OT Hours</th>
                </tr>
              </thead>
              <tbody>
                {(empFilter === 'all' ? rows : rows.filter(r => r.emp.id === empFilter)).map(({ emp, total, regularHrs, totalOT, daysPresent, attendance }) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{daysPresent}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{monthBizDays}</td>
                    <td>
                      <span style={{ color: attendance < 60 ? 'var(--red)' : attendance < 80 ? 'var(--amber)' : 'var(--green)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {attendance}%
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(Math.round(total * 10) / 10)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtH(Math.round(regularHrs * 10) / 10)}</td>
                    <td style={{ color: totalOT > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: totalOT > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                      {totalOT > 0 ? `+${fmtH(Math.round(totalOT * 10) / 10)}` : '—'}
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

  // ── Edit Log ──────────────────────────────────────────────────────────────

  function renderEdits() {
    return (
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
                <th>Edited At</th>
              </tr>
            </thead>
            <tbody>
              {edits.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No edits recorded yet.</td></tr>
                : edits.map(edit => {
                  const d = edit.details as Record<string, Record<string, string>>
                  return (
                    <tr key={edit.id}>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{empMap[edit.employee_id]?.name ?? '—'}</td>
                      <td>{d?.date ? fmtDate(String(d.date)) : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {d?.original?.clock_in ? laTime(String(d.original.clock_in)) : '—'} → {d?.original?.clock_out ? laTime(String(d.original.clock_out)) : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {d?.updated?.clock_in ? laTime(String(d.updated.clock_in)) : '—'} → {d?.updated?.clock_out ? laTime(String(d.updated.clock_out)) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{String(d?.edit_note ?? '—')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(edit.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: LA_TZ })}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── OT Summary Panel (shown on weekly/monthly tabs) ───────────────────────

  function renderOTPanelWeekly() {
    const ranked = employees.map(emp => {
      const total = weekDays.reduce((s: number, d) => {
        const e = byEmpDate[emp.id]?.[d]
        return s + (e ? (entryHours(e, nowMs) ?? 0) : 0)
      }, 0)
      return { emp, total, ot: Math.max(0, total - 8 * weekDays.length) }
    }).filter(r => r.ot > 0).sort((a, b) => b.ot - a.ot)

    if (ranked.length === 0) return null

    return (
      <div className="card" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
        <div className="card-title" style={{ color: 'var(--amber)', marginBottom: 10 }}>Overtime This Week</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ranked.map(({ emp, total, ot }) => (
            <div key={emp.id} style={{ display: 'flex', gap: 8, padding: '6px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</span>
              <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtH(Math.round(total * 10) / 10)} (+{fmtH(Math.round(ot * 10) / 10)})</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          employeeName={empMap[editingEntry.employee_id]?.name ?? 'Unknown'}
          onClose={() => setEditingEntry(null)}
          onSave={updated => {
            setAllEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
            setEditingEntry(null)
          }}
        />
      )}

      {/* Top controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="tabs" style={{ marginBottom: 0, flex: 1 }}>
          {([
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'weekly', label: 'This Week' },
            { key: 'monthly', label: 'This Month' },
            { key: 'edits', label: 'Edit Log' },
          ] as { key: typeof tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={empFilter}
          onChange={e => setEmpFilter(e.target.value)}
          className="field-input"
          style={{ marginBottom: 0, width: 'auto', minWidth: 160, fontSize: 12.5 }}
        >
          <option value="all">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={handleRefresh} disabled={refreshing} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {tab === 'today' && renderToday()}
      {tab === 'yesterday' && renderYesterday()}
      {tab === 'weekly' && (
        <>
          {renderWeekly()}
          {renderOTPanelWeekly()}
        </>
      )}
      {tab === 'monthly' && renderMonthly()}
      {tab === 'edits' && renderEdits()}
    </div>
  )
}
