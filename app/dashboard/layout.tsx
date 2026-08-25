import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { MobileShell } from '@/components/MobileShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('name')
    .eq('work_email', session.user.email!)
    .single()

  return (
    <MobileShell
      role={session.user.role ?? 'employee'}
      name={employee?.name ?? session.user.email ?? ''}
      email={session.user.email ?? ''}
    >
      {children}
    </MobileShell>
  )
}
