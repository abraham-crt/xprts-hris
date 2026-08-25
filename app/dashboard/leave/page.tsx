import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { LeaveForm } from '@/components/LeaveForm'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'

export default async function LeavePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  // Fetch employee start date and PTO record in parallel with leave requests
  const [{ data: employee }, { data: ptoBefore }, { data: requests }] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('employment_start_date')
      .eq('id', session.user.id)
      .single(),
    supabaseAdmin
      .from('pto_balances')
      .select('current_balance, last_accrual_date, accrual_history')
      .eq('employee_id', session.user.id)
      .single(),
    supabaseAdmin
      .from('leave_requests')
      .select('*')
      .eq('employee_id', session.user.id)
      .order('created_at', { ascending: false }),
  ])

  let ptoBalance = ptoBefore?.current_balance ?? 0

  // Run accrual directly on the server
  if (employee?.employment_start_date) {
    const result = computeAccrualUpdates({
      employmentStartDate: employee.employment_start_date,
      currentBalance: ptoBefore?.current_balance ?? 0,
      lastAccrualDate: ptoBefore?.last_accrual_date ?? null,
      accrualHistory: (ptoBefore?.accrual_history ?? []) as AccrualEvent[],
    })

    if (result.hasChanges) {
      const { data: updated } = await supabaseAdmin
        .from('pto_balances')
        .upsert({
          employee_id: session.user.id,
          current_balance: result.newBalance,
          last_accrual_date: result.newLastAccrualDate,
          accrual_history: result.newAccrualHistory,
        }, { onConflict: 'employee_id' })
        .select('current_balance')
        .single()

      ptoBalance = updated?.current_balance ?? result.newBalance
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Requests</h1>
        <p className="page-subtitle">Submit time-off requests and track their status. Business days only.</p>
      </div>
      <LeaveForm
        initialRequests={requests ?? []}
        ptoBalance={ptoBalance}
      />
    </div>
  )
}
