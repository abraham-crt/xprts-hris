import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch employee start date
  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('employment_start_date')
    .eq('id', session.user.id)
    .single()

  if (!employee?.employment_start_date) {
    return NextResponse.json({ error: 'Employee record not found.' }, { status: 404 })
  }

  // Fetch current PTO balance record
  const { data: pto } = await supabaseAdmin
    .from('pto_balances')
    .select('current_balance, last_accrual_date, accrual_history')
    .eq('employee_id', session.user.id)
    .single()

  const currentBalance = pto?.current_balance ?? 0
  const lastAccrualDate = pto?.last_accrual_date ?? null
  const accrualHistory = (pto?.accrual_history ?? []) as AccrualEvent[]

  const result = computeAccrualUpdates({
    employmentStartDate: employee.employment_start_date,
    currentBalance,
    lastAccrualDate,
    accrualHistory,
  })

  if (!result.hasChanges) {
    return NextResponse.json({ balance: currentBalance, events: [] })
  }

  await supabaseAdmin
    .from('pto_balances')
    .upsert({
      employee_id: session.user.id,
      current_balance: result.newBalance,
      last_accrual_date: result.newLastAccrualDate,
      accrual_history: result.newAccrualHistory,
    }, { onConflict: 'employee_id' })

  const newEvents = result.newAccrualHistory.slice(accrualHistory.length)
  return NextResponse.json({ balance: result.newBalance, events: newEvents })
}
