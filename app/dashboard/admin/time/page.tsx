import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { AdminTimeView } from '@/components/AdminTimeView'

export default async function AdminTimePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email, role')
    .eq('status', 'active')
    .order('name')

  const { data: entries } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: false })

  // Audit log of time edits
  const { data: edits } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('action', 'time_entry_edited')
    .order('performed_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Team Time</h1>
        <p className="page-subtitle">Pay period: {periodStart} → {periodEnd} · All times in PST</p>
      </div>
      <AdminTimeView
        employees={employees ?? []}
        entries={entries ?? []}
        edits={edits ?? []}
        today={today}
      />
    </div>
  )
}
