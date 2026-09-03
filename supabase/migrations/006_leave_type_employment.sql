-- Migration 006: leave_type on leave_requests, employment_type + employee_code on employees

-- Leave type for categorizing leave requests
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_type TEXT NOT NULL DEFAULT 'pto';

-- Employment type for employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'full-time';

-- Human-readable employee code (e.g. EMP-001), nullable
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_code TEXT;
