import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laPeriodBounds } from '@/lib/dates'
import { PayrollView } from '@/components/PayrollView'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'

export default async function PayrollPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { periodStart, periodEnd } = laPeriodBounds()
  const periodLabel = `${periodStart} → ${periodEnd}`

  const [
    { data: employees },
    { data: entries },
    { data: leaveRequests },
    { data: ptoBalances },
    { data: deductions },
  ] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, work_email, office_location, monthly_salary, approver_id, employment_start_date')
      .eq('status', 'active')
      .order('name'),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, total_hours')
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .not('total_hours', 'is', null),
    supabaseAdmin
      .from('leave_requests')
      .select('employee_id, days_requested')
      .eq('status', 'approved')
      .gte('start_date', periodStart)
      .lte('end_date', periodEnd),
    supabaseAdmin
      .from('pto_balances')
      .select('employee_id, current_balance, last_accrual_date, accrual_history'),
    supabaseAdmin
      .from('payroll_deductions')
      .select('employee_id, pto_days_used, shortfall_days, shortfall_deduction, net_pay')
      .eq('pay_period_start', periodStart),
  ])

  // Run PTO accrual for all active employees before computing payroll
  const ptoMap: Record<string, number> = {}
  const ptoByEmployee = Object.fromEntries((ptoBalances ?? []).map(p => [p.employee_id, p]))

  for (const emp of employees ?? []) {
    const pto = ptoByEmployee[emp.id]
    const startDate = (emp as { employment_start_date?: string | null }).employment_start_date

    if (startDate) {
      const result = computeAccrualUpdates({
        employmentStartDate: startDate,
        currentBalance: pto?.current_balance ?? 0,
        lastAccrualDate: pto?.last_accrual_date ?? null,
        accrualHistory: (pto?.accrual_history ?? []) as AccrualEvent[],
      })

      if (result.hasChanges) {
        const { data: updated } = await supabaseAdmin
          .from('pto_balances')
          .upsert({
            employee_id: emp.id,
            current_balance: result.newBalance,
            last_accrual_date: result.newLastAccrualDate,
            accrual_history: result.newAccrualHistory,
          }, { onConflict: 'employee_id' })
          .select('current_balance')
          .single()

        ptoMap[emp.id] = updated?.current_balance ?? result.newBalance
      } else {
        ptoMap[emp.id] = pto?.current_balance ?? 0
      }
    } else {
      ptoMap[emp.id] = pto?.current_balance ?? 0
    }
  }

  const hoursMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    hoursMap[e.employee_id] = (hoursMap[e.employee_id] ?? 0) + (e.total_hours ?? 0)
  }

  const leaveMap: Record<string, number> = {}
  for (const r of leaveRequests ?? []) {
    leaveMap[r.employee_id] = (leaveMap[r.employee_id] ?? 0) + (r.days_requested ?? 0)
  }

  type DeductionRow = { pto_days_used: number; shortfall_days: number; shortfall_deduction: number; net_pay: number } | null
  const deductionMap: Record<string, DeductionRow> = {}
  for (const d of deductions ?? []) {
    deductionMap[d.employee_id] = {
      pto_days_used: d.pto_days_used,
      shortfall_days: d.shortfall_days,
      shortfall_deduction: d.shortfall_deduction,
      net_pay: d.net_pay,
    }
  }

  // Strip employment_start_date from employees before passing to client component
  const employeesForView = (employees ?? []).map(({ id, name, work_email, office_location, monthly_salary }) => ({
    id, name, work_email, office_location, monthly_salary,
  }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payroll</h1>
        <p className="page-subtitle">Deduction breakdown for the current pay period. Set each employee&apos;s gross salary to compute deductions.</p>
      </div>
      <PayrollView
        employees={employeesForView}
        hoursMap={hoursMap}
        leaveMap={leaveMap}
        ptoMap={ptoMap}
        deductionMap={deductionMap}
        periodLabel={periodLabel}
      />
    </div>
  )
}
