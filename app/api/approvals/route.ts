import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { sendLeaveDecisionEmail } from '@/lib/email'

function monthsEmployed(startDate: string, today: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - sy) * 12 + (tm - sm)
  if (td < sd) months--
  return Math.max(0, months)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'employee') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { requestId, action, note } = await req.json()
  if (!requestId || !action || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { data: leave, error: fetchErr } = await supabaseAdmin
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchErr || !leave) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 })
  if (leave.status !== 'pending') return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 })

  const newStatus = action === 'approve' ? 'approved' : 'denied'

  const { data, error } = await supabaseAdmin
    .from('leave_requests')
    .update({
      status: newStatus,
      approver_note: note || null,
      reviewed_by: session.user.email,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Payroll deductions on approval ──
  if (newStatus === 'approved') {
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('employment_start_date, monthly_salary')
      .eq('id', leave.employee_id)
      .single()

    const monthlySalary: number | null = employee?.monthly_salary ?? null

    if (monthlySalary !== null && employee?.employment_start_date) {
      const today = laToday()
      const months = monthsEmployed(employee.employment_start_date, today)
      const dailyRate = (monthlySalary / 173.33) * 8
      const daysRequested: number = leave.days_requested

      let ptoDaysUsed = 0
      let shortfallDays = 0
      let shortfallDeduction = 0

      if (months < 6) {
        shortfallDays = daysRequested
        shortfallDeduction = shortfallDays * dailyRate
        ptoDaysUsed = 0
      } else {
        const { data: pto } = await supabaseAdmin
          .from('pto_balances')
          .select('current_balance')
          .eq('employee_id', leave.employee_id)
          .single()

        const ptoBalance: number = pto?.current_balance ?? 0

        if (ptoBalance >= daysRequested) {
          ptoDaysUsed = daysRequested
          shortfallDays = 0
          shortfallDeduction = 0
        } else {
          ptoDaysUsed = ptoBalance
          shortfallDays = daysRequested - ptoBalance
          shortfallDeduction = shortfallDays * dailyRate
        }

        if (ptoDaysUsed > 0) {
          await supabaseAdmin
            .from('pto_balances')
            .update({ current_balance: Math.max(0, (pto?.current_balance ?? 0) - ptoDaysUsed) })
            .eq('employee_id', leave.employee_id)
        }
      }

      const { periodStart, periodEnd } = laPeriodBounds()

      // Fetch existing row to accumulate (multiple leaves in same period)
      const { data: existing } = await supabaseAdmin
        .from('payroll_deductions')
        .select('leave_days, pto_days_used, shortfall_days, shortfall_deduction')
        .eq('employee_id', leave.employee_id)
        .eq('pay_period_start', periodStart)
        .single()

      const totalLeaveDays = (existing?.leave_days ?? 0) + daysRequested
      const totalPtoDaysUsed = (existing?.pto_days_used ?? 0) + ptoDaysUsed
      const totalShortfallDays = (existing?.shortfall_days ?? 0) + shortfallDays
      const totalShortfallDeduction = (existing?.shortfall_deduction ?? 0) + shortfallDeduction
      const netPay = monthlySalary - totalShortfallDeduction

      await supabaseAdmin
        .from('payroll_deductions')
        .upsert({
          employee_id: leave.employee_id,
          pay_period_start: periodStart,
          pay_period_end: periodEnd,
          monthly_salary: monthlySalary,
          daily_rate: dailyRate,
          leave_days: totalLeaveDays,
          pto_days_used: totalPtoDaysUsed,
          shortfall_days: totalShortfallDays,
          shortfall_deduction: totalShortfallDeduction,
          net_pay: netPay,
        }, { onConflict: 'employee_id,pay_period_start' })
    }
  }

  // ── Notify employee of decision (in-app + email) ──
  const notifTitle = newStatus === 'approved' ? 'Leave Approved' : 'Leave Denied'
  const notifBody = newStatus === 'approved'
    ? `Your ${leave.days_requested}-day leave request (${leave.start_date} – ${leave.end_date}) was approved.`
    : `Your ${leave.days_requested}-day leave request (${leave.start_date} – ${leave.end_date}) was denied.${note ? ` Note: ${note}` : ''}`

  const { data: empForEmail } = await supabaseAdmin
    .from('employees')
    .select('name, work_email')
    .eq('id', leave.employee_id)
    .single()

  await Promise.all([
    supabaseAdmin.from('notifications').insert({
      employee_id: leave.employee_id,
      title: notifTitle,
      body: notifBody,
    }),
    empForEmail?.work_email
      ? sendLeaveDecisionEmail({
          toEmail: empForEmail.work_email,
          toName: empForEmail.name ?? 'there',
          status: newStatus as 'approved' | 'denied',
          daysRequested: leave.days_requested,
          startDate: leave.start_date,
          endDate: leave.end_date,
          note: note || null,
        })
      : Promise.resolve(),
  ])

  // Audit log
  await supabaseAdmin.from('audit_log').insert({
    employee_id: leave.employee_id,
    action: `leave_${newStatus}`,
    details: {
      request_id: requestId,
      days: leave.days_requested,
      reviewed_by: session.user.email,
      note: note || null,
    },
  })

  return NextResponse.json(data)
}
