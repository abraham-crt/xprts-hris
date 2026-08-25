import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

function calcBusinessDays(startStr: string, endStr: string): number {
  let count = 0
  const current = new Date(startStr + 'T12:00:00')
  const end = new Date(endStr + 'T12:00:00')
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('leave_requests')
    .select('*')
    .eq('employee_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { start_date, end_date, is_half_day, reason, file_url } = await req.json()

  if (!start_date) {
    return NextResponse.json({ error: 'Start date is required.' }, { status: 400 })
  }

  // Validate half-day constraint
  if (is_half_day && start_date !== end_date) {
    return NextResponse.json({ error: 'Half-day requests must have the same start and end date.' }, { status: 400 })
  }

  const effectiveEndDate = end_date || start_date

  if (start_date > effectiveEndDate) {
    return NextResponse.json({ error: 'End date must be on or after start date.' }, { status: 400 })
  }

  let days_requested: number
  if (is_half_day) {
    days_requested = 0.5
  } else {
    days_requested = calcBusinessDays(start_date, effectiveEndDate)
    if (days_requested === 0) {
      return NextResponse.json({ error: 'No business days in the selected range.' }, { status: 400 })
    }
  }

  // Fetch employee record (approver_id, employment_start_date)
  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('approver_id, employment_start_date')
    .eq('id', session.user.id)
    .single()

  // Fetch PTO balance for warning
  const { data: pto } = await supabaseAdmin
    .from('pto_balances')
    .select('current_balance')
    .eq('employee_id', session.user.id)
    .single()

  const ptoBalance = pto?.current_balance ?? 0

  // Check for overlapping approved or pending requests
  const { data: existing } = await supabaseAdmin
    .from('leave_requests')
    .select('id')
    .eq('employee_id', session.user.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', effectiveEndDate)
    .gte('end_date', start_date)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'You already have a leave request that overlaps with this period.' }, { status: 409 })
  }

  const { data, error } = await supabaseAdmin
    .from('leave_requests')
    .insert({
      employee_id: session.user.id,
      approver_id: employee?.approver_id ?? null,
      start_date,
      end_date: effectiveEndDate,
      is_half_day: is_half_day ?? false,
      days_requested,
      reason: reason || null,
      file_url: file_url || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach a warning if balance is low (but still allow submission)
  const response = { ...data, _warning: ptoBalance < days_requested ? `Low PTO balance: ${ptoBalance} days available` : undefined }
  return NextResponse.json(response, { status: 201 })
}
