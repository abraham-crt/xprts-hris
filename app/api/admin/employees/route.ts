import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email, role, status, employment_start_date, office_location, monthly_salary, approver_id')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, work_email, role, office_location, employment_start_date, monthly_salary, approver_id } = await req.json()

  if (!name || !work_email || !role || !office_location || !employment_start_date) {
    return NextResponse.json({ error: 'All required fields must be filled.' }, { status: 400 })
  }

  // Check email uniqueness
  const { data: existing } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('work_email', work_email.toLowerCase())
    .single()

  if (existing) return NextResponse.json({ error: 'An employee with this email already exists.' }, { status: 409 })

  const { data, error } = await supabaseAdmin
    .from('employees')
    .insert({
      name,
      work_email: work_email.toLowerCase(),
      role,
      office_location,
      employment_start_date,
      status: 'active',
      monthly_salary: monthly_salary ?? null,
      approver_id: approver_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Initialize PTO balance
  await supabaseAdmin.from('pto_balances').insert({
    employee_id: data.id,
    current_balance: 0,
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, name, role, status, office_location, monthly_salary, approver_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Employee ID required.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (status !== undefined) updates.status = status
  if (office_location !== undefined) updates.office_location = office_location
  if (monthly_salary !== undefined) updates.monthly_salary = monthly_salary ?? null
  if (approver_id !== undefined) updates.approver_id = approver_id || null

  const { data, error } = await supabaseAdmin
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
