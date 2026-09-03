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

  // Derived date ranges
  const [year, month, day] = today.split('-').map(Number)
  const yDay = new Date(Date.UTC(year, month - 1, day - 1))
  const yesterday = yDay.toLocaleDateString('en-CA', { timeZone: 'UTC' })

  const todayJs = new Date(today + 'T12:00:00')
  const dow = todayJs.getDay()
  const daysToMon = dow === 0 ? 6 : dow - 1
  const weekStartJs = new Date(todayJs)
  weekStartJs.setDate(todayJs.getDate() - daysToMon)
  const weekStart = weekStartJs.toLocaleDateString('en-CA', { timeZone: 'UTC' })

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  // Fetch from earliest needed date
  const fetchFrom = [monthStart, periodStart, weekStart].sort()[0]

  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email, role')
    .eq('status', 'active')
    .order('name')

  const { data: entries } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .gte('date', fetchFrom)
    .lte('date', today)
    .order('date', { ascending: false })

  const { data: edits } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('action', 'time_entry_edited')
    .order('performed_at', { ascending: false })
    .limit(100)

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
        yesterday={yesterday}
        weekStart={weekStart}
        monthStart={monthStart}
      />
    </div>
  )
}
