-- Add salary to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2);

-- Add missing columns to leave_requests
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT; -- stores reviewer email
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
