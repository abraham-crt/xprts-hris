-- Create leave_requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type        TEXT NOT NULL CHECK (leave_type IN ('pto', 'sick_leave', 'emergency', 'unpaid')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  days_requested    INT NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  approver_note     TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create pto_balances table
CREATE TABLE IF NOT EXISTS pto_balances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  current_balance   NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add monthly_salary to employees if not already there
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2);

-- Initialize pto_balances for any existing employees who don't have a record yet
INSERT INTO pto_balances (employee_id, current_balance)
SELECT id, 0
FROM employees
WHERE id NOT IN (SELECT employee_id FROM pto_balances);

-- Enable RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;

-- leave_requests: employees can see/create their own; service role bypasses
CREATE POLICY "employees_own_leave" ON leave_requests
  FOR ALL USING (auth.uid() = employee_id);

-- pto_balances: employees can read their own; service role bypasses
CREATE POLICY "employees_own_pto" ON pto_balances
  FOR SELECT USING (auth.uid() = employee_id);
