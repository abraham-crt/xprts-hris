import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, isPayPeriodLocked } from '@/lib/dates'

function calcTotalHours(clockIn: string, clockOut: string, breaks: { start: string; end: string }[]) {
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  const breakMs = breaks.reduce((acc, b) => {
    if (b.start && b.end) return acc + (new Date(b.end).getTime() - new Date(b.start).getTime())
    return acc
  }, 0)
  return Math.round(((totalMs - breakMs) / 3600000) * 100) / 100
}


export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json()
  const employeeId = session.user.id
  const now = new Date().toISOString()
  const today = laToday()

  const { data: existing } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .single()

  if (action === 'clock_in') {
    if (existing) return NextResponse.json({ error: 'Already clocked in today' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .insert({ employee_id: employeeId, date: today, clock_in: now, breaks: [] })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (!existing) return NextResponse.json({ error: 'No active entry for today' }, { status: 400 })

  const breaks: { start: string; end: string }[] = existing.breaks ?? []

  if (action === 'start_break') {
    const updatedBreaks = [...breaks, { start: now, end: '' }]
    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .update({ breaks: updatedBreaks })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'end_break') {
    const updatedBreaks = breaks.map((b, i) =>
      i === breaks.length - 1 && !b.end ? { ...b, end: now } : b
    )
    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .update({ breaks: updatedBreaks })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'clock_out') {
    const closedBreaks = breaks.map(b => (!b.end ? { ...b, end: now } : b))
    const totalHours = calcTotalHours(existing.clock_in, now, closedBreaks)

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .update({ clock_out: now, breaks: closedBreaks, total_hours: totalHours })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Edit an existing time entry — logs original values to audit_log before saving
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entryId, clock_in, clock_out, edit_note } = await req.json()

  // Fetch the existing entry and verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .eq('employee_id', session.user.id)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Enforce pay period lock — but never block an active (not yet clocked out) entry
  if (existing.clock_out && isPayPeriodLocked(existing.date)) {
    return NextResponse.json({ error: 'This pay period is locked and cannot be edited.' }, { status: 403 })
  }

  // Log the original values to audit_log before overwriting
  await supabaseAdmin.from('audit_log').insert({
    employee_id: session.user.id,
    action: 'time_entry_edited',
    details: {
      entry_id: entryId,
      date: existing.date,
      original: { clock_in: existing.clock_in, clock_out: existing.clock_out, total_hours: existing.total_hours },
      updated: { clock_in, clock_out },
      edit_note: edit_note ?? null,
    },
  })

  // Recalculate total hours with edited times
  const totalHours = clock_in && clock_out
    ? calcTotalHours(clock_in, clock_out, existing.breaks ?? [])
    : existing.total_hours

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update({
      clock_in,
      clock_out,
      total_hours: totalHours,
      is_edited: true,
      edit_note: edit_note ?? null,
    })
    .eq('id', entryId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
