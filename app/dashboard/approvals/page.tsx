import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { ApprovalsView } from '@/components/ApprovalsView'

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role === 'employee') redirect('/dashboard')

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email')
    .eq('status', 'active')
    .order('name')

  let requestsQuery = supabaseAdmin
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (session.user.role === 'approver') {
    // Only show requests from employees assigned to this approver
    const { data: myTeam } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('approver_id', session.user.id)

    const myTeamIds = (myTeam ?? []).map(e => e.id)
    if (myTeamIds.length > 0) {
      requestsQuery = requestsQuery.in('employee_id', myTeamIds)
    } else {
      // No team assigned — return empty
      requestsQuery = requestsQuery.eq('employee_id', 'none-00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: requests } = await requestsQuery

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Approvals</h1>
        <p className="page-subtitle">Review and action leave requests from your team.</p>
      </div>
      <ApprovalsView
        employees={employees ?? []}
        initialRequests={requests ?? []}
      />
    </div>
  )
}
