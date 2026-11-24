-- PostgreSQL 15+ Schema for Rhitusworld Photography Gift Certificate Studio
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS gift_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  recipient_name VARCHAR(160) NOT NULL,
  recipient_email VARCHAR(160),
  purchaser_name VARCHAR(160) NOT NULL,
  purchaser_email VARCHAR(160),
  package_name VARCHAR(200) NOT NULL,
  package_description TEXT,
  original_amount NUMERIC(10, 2) NOT NULL CHECK (original_amount > 0),
  remaining_balance NUMERIC(10, 2) NOT NULL CHECK (remaining_balance >= 0),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE NOT NULL,
  authorized_photographer VARCHAR(160) NOT NULL DEFAULT 'Rhituraj Sarma',
  personal_message TEXT,
  theme VARCHAR(24) NOT NULL DEFAULT 'ivory',
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificate_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES gift_certificates(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  amount NUMERIC(10, 2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_code ON gift_certificates(code);
CREATE INDEX IF NOT EXISTS idx_audit_certificate_id ON certificate_audit_logs(certificate_id);