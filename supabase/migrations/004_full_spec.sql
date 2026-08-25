-- employees additions
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES employees(id);

-- Recreate leave_requests with correct schema (drop old, create new)
DROP TABLE IF EXISTS leave_requests CASCADE;
CREATE TABLE leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  approver_id    UUID REFERENCES employees(id),
  days_requested NUMERIC(4,1) NOT NULL CHECK (days_requested > 0),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  is_half_day    BOOLEAN NOT NULL DEFAULT false,
  reason         TEXT,
  file_url       TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  approver_note  TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_own_leave" ON leave_requests FOR ALL USING (auth.uid() = employee_id);

-- pto_balances additions
ALTER TABLE pto_balances ADD COLUMN IF NOT EXISTS last_accrual_date DATE;
ALTER TABLE pto_balances ADD COLUMN IF NOT EXISTS accrual_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- payroll_deductions table
DROP TABLE IF EXISTS payroll_deductions CASCADE;
CREATE TABLE payroll_deductions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_start    DATE NOT NULL,
  pay_period_end      DATE NOT NULL,
  monthly_salary      NUMERIC(10,2) NOT NULL,
  daily_rate          NUMERIC(10,4) NOT NULL,
  leave_days          NUMERIC(4,1) NOT NULL DEFAULT 0,
  pto_days_used       NUMERIC(4,1) NOT NULL DEFAULT 0,
  shortfall_days      NUMERIC(4,1) NOT NULL DEFAULT 0,
  shortfall_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_pay             NUMERIC(10,2) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, pay_period_start)
);
ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;

-- Re-seed missing PTO balance rows
INSERT INTO pto_balances (employee_id, current_balance)
SELECT id, 0 FROM employees
WHERE id NOT IN (SELECT employee_id FROM pto_balances);
