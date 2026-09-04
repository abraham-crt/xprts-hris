import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import Link from 'next/link'
import { EmployeeProfileView } from '@/components/EmployeeProfileView'

function tenure(startDate: string): string {
  const ms = Date.now() - new Date(startDate + 'T12:00:00').getTime()
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12); const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`
}

export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { id } = params
  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()

  const [
    { data: emp },
    { data: pto },
    { data: leaveRequests },
    { data: timeEntries },
    { data: deductionRow },
    { data: auditLog },
    { data: payslipHistory },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('*').eq('id', id).single(),
    supabaseAdmin.from('pto_balances').select('current_balance').eq('employee_id', id).single(),
    supabaseAdmin.from('leave_requests').select('*').eq('employee_id', id).order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('time_entries').select('*').eq('employee_id', id).gte('date', periodStart).lte('date', today).order('date', { ascending: false }),
    supabaseAdmin.from('payroll_deductions').select('*').eq('pay_period_start', periodStart).eq('employee_id', id).single(),
    supabaseAdmin.from('audit_log').select('*').eq('employee_id', id).order('performed_at', { ascending: false }).limit(50),
    supabaseAdmin.from('payroll_deductions').select('*').eq('employee_id', id).order('pay_period_start', { ascending: false }).limit(24),
  ])

  if (!emp) redirect('/dashboard/admin/employees')

  const [managerData, approverData] = await Promise.all([
    emp.manager_id ? supabaseAdmin.from('employees').select('name').eq('id', emp.manager_id).single() : Promise.resolve({ data: null }),
    emp.approver_id ? supabaseAdmin.from('employees').select('name').eq('id', emp.approver_id).single() : Promise.resolve({ data: null }),
  ])

  const managerName = managerData?.data?.name ?? null
  const approverName = approverData?.data?.name ?? null

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard/admin/employees" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
            ← Employees
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 6 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{emp.name}</h1>
            <p className="page-subtitle">
              {emp.employee_code && <span style={{ fontFamily: 'monospace', marginRight: 10 }}>{emp.employee_code}</span>}
              {emp.work_email}
              {emp.employment_start_date && <span style={{ marginLeft: 10, color: 'var(--text-muted)' }}>· {tenure(emp.employment_start_date)} tenure</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{emp.status}</span>
            <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{emp.role}</span>
          </div>
        </div>
      </div>

      <EmployeeProfileView
        emp={{
          id: emp.id,
          name: emp.name,
          work_email: emp.work_email,
          employee_code: emp.employee_code ?? null,
          role: emp.role,
          status: emp.status,
          employment_type: emp.employment_type ?? null,
          employment_start_date: emp.employment_start_date ?? null,
          office_location: emp.office_location ?? null,
          monthly_salary: emp.monthly_salary ?? null,
          shift_schedule: emp.shift_schedule ?? null,
          payslip_delivery: emp.payslip_delivery ?? null,
        }}
        managerName={managerName}
        approverName={approverName}
        pto={pto?.current_balance ?? 0}
        leaveRequests={leaveRequests ?? []}
        timeEntries={timeEntries ?? []}
        deductionRow={deductionRow ?? null}
        auditLog={auditLog ?? []}
        payslipHistory={payslipHistory ?? []}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    </div>
  )
}
