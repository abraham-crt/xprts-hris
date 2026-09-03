import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { EmployeesView } from '@/components/EmployeesView'

export default async function EmployeesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { data: employees, error: empError } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email, role, status, employment_start_date, office_location, monthly_salary, approver_id')
    .order('name')

  if (empError) console.error('[employees page]', empError.message, empError.details)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        <p className="page-subtitle">Manage your team.</p>
      </div>
      <EmployeesView initialEmployees={employees ?? []} />
    </div>
  )
}
