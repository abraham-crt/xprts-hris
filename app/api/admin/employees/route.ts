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
    .select('id, name, work_email, role, status, employment_start_date, office_location, monthly_salary, approver_id, employment_type, employee_code, manager_id, shift_schedule, payslip_delivery')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, work_email, role, office_location, employment_start_date, monthly_salary, approver_id, employment_type, employee_code, manager_id, shift_schedule, payslip_delivery } = await req.json()

  if (!name || !work_email || !role || !office_location || !employment_start_date) {
    return NextResponse.json({ error: 'All required fields must be filled.' }, { status: 400 })
  }

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
      employment_type: employment_type || 'full-time',
      employee_code: employee_code || null,
      manager_id: manager_id || null,
      shift_schedule: shift_schedule || null,
      payslip_delivery: payslip_delivery || 'email',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('pto_balances').insert({ employee_id: data.id, current_balance: 0 })

  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, name, role, status, office_location, monthly_salary, approver_id, employment_type, employee_code, manager_id, shift_schedule, payslip_delivery } = await req.json()
  if (!id) return NextResponse.json({ error: 'Employee ID required.' }, { status: 400 })

  // Fetch current salary for audit trail
  const { data: current } = await supabaseAdmin.from('employees').select('monthly_salary').eq('id', id).single()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (status !== undefined) updates.status = status
  if (office_location !== undefined) updates.office_location = office_location
  if (monthly_salary !== undefined) updates.monthly_salary = monthly_salary ?? null
  if (approver_id !== undefined) updates.approver_id = approver_id || null
  if (employment_type !== undefined) updates.employment_type = employment_type
  if (employee_code !== undefined) updates.employee_code = employee_code || null
  if (manager_id !== undefined) updates.manager_id = manager_id || null
  if (shift_schedule !== undefined) updates.shift_schedule = shift_schedule || null
  if (payslip_delivery !== undefined) updates.payslip_delivery = payslip_delivery || 'email'

  const { data, error } = await supabaseAdmin
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit salary change
  if (monthly_salary !== undefined && monthly_salary !== current?.monthly_salary) {
    await supabaseAdmin.from('audit_log').insert({
      employee_id: id,
      action: 'salary_changed',
      details: {
        previous: current?.monthly_salary,
        updated: monthly_salary,
        changed_by: session.user.id,
      },
      performed_at: new Date().toISOString(),
    })
  }

  return NextResponse.json(data)
}
