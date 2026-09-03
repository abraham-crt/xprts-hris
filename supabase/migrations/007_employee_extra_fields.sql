-- Migration 007: Additional employee fields + audit for salary changes
-- Run in Supabase SQL editor

ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_schedule TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payslip_delivery TEXT NOT NULL DEFAULT 'email';

-- Index for manager lookups
CREATE INDEX IF NOT EXISTS employees_manager_id_idx ON employees(manager_id);
