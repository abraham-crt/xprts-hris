import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { TimeTracker } from '@/components/TimeTracker'

export default async function TimePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const today = laToday()

  const { data: todayEntry } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('employee_id', session.user.id)
    .eq('date', today)
    .single()

  const { data: recentEntries } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('employee_id', session.user.id)
    .order('date', { ascending: false })
    .limit(14)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Time</h1>
        <p className="page-subtitle">Clock in, take breaks, and view your recent hours. All times in PST.</p>
      </div>
      <TimeTracker
        employeeId={session.user.id}
        todayEntry={todayEntry ?? null}
        recentEntries={recentEntries ?? []}
      />
    </div>
  )
}
