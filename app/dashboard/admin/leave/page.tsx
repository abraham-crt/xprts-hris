import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { AdminLeaveView } from '@/components/AdminLeaveView'

export default async function AdminLeavePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const [
    { data: employees },
    { data: leaveRequests },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, work_email').eq('status', 'active').order('name'),
    supabaseAdmin.from('leave_requests').select('*').order('created_at', { ascending: false }),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Management</h1>
        <p className="page-subtitle">View and filter all employee leave requests · all-time history</p>
      </div>
      <AdminLeaveView
        employees={employees ?? []}
        initialRequests={leaveRequests ?? []}
      />
    </div>
  )
}
