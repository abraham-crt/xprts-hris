import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { ReportsView } from '@/components/ReportsView'

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()
  const [year, month] = today.split('-').map(Number)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const [
    { data: employees },
    { data: timeEntries },
    { data: leaveRequests },
    { data: payrollDeductions },
    { data: salaryRows },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, office_location, role, employment_type, monthly_salary').eq('status', 'active').order('name'),
    supabaseAdmin.from('time_entries').select('employee_id, date, clock_in, clock_out, total_hours').gte('date', monthStart).lte('date', today).order('date'),
    supabaseAdmin.from('leave_requests').select('employee_id, start_date, end_date, days_requested, leave_type, status, created_at, reviewed_at').gte('created_at', `${year}-01-01`).order('created_at', { ascending: false }),
    supabaseAdmin.from('payroll_deductions').select('*').eq('pay_period_start', periodStart),
    supabaseAdmin.from('employees').select('id, monthly_salary, office_location').eq('status', 'active').not('monthly_salary', 'is', null),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Attendance, overtime, leave, and payroll analytics · {today}</p>
      </div>
      <ReportsView
        employees={employees ?? []}
        timeEntries={timeEntries ?? []}
        leaveRequests={leaveRequests ?? []}
        payrollDeductions={payrollDeductions ?? []}
        salaryRows={salaryRows ?? []}
        periodStart={periodStart}
        periodEnd={periodEnd}
        monthStart={monthStart}
        today={today}
      />
    </div>
  )
}
