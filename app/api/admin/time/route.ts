import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

function calcTotalHours(clockIn: string, clockOut: string, breaks: { start: string; end: string }[]) {
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  const breakMs = breaks.reduce((acc, b) => {
    if (b.start && b.end) return acc + (new Date(b.end).getTime() - new Date(b.start).getTime())
    return acc
  }, 0)
  return Math.round(((totalMs - breakMs) / 3600000) * 100) / 100
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { entryId, clock_in, clock_out, edit_note } = await req.json()

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Log original values to audit_log before overwriting
  await supabaseAdmin.from('audit_log').insert({
    employee_id: existing.employee_id,
    action: 'time_entry_edited',
    details: {
      entry_id: entryId,
      date: existing.date,
      edited_by: session.user.email,
      edited_by_role: 'admin',
      original: { clock_in: existing.clock_in, clock_out: existing.clock_out, total_hours: existing.total_hours },
      updated: { clock_in, clock_out },
      edit_note: edit_note ?? null,
    },
  })

  const totalHours = clock_in && clock_out
    ? calcTotalHours(clock_in, clock_out, existing.breaks ?? [])
    : existing.total_hours

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update({ clock_in, clock_out, total_hours: totalHours, is_edited: true, edit_note: edit_note ?? null })
    .eq('id', entryId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
