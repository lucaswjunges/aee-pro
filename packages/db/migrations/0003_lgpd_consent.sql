-- Add LGPD consent tracking to students
ALTER TABLE students ADD COLUMN lgpd_consent_at TEXT;
ALTER TABLE students ADD COLUMN lgpd_consent_by TEXT;
