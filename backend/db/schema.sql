-- PostgreSQL 15+ Schema for Rhitusworld Photography Gift Certificate Studio
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

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

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR(160) NOT NULL CHECK (length(trim(client_name)) > 0),
  client_email VARCHAR(160),
  client_phone VARCHAR(80),
  photographer VARCHAR(160) NOT NULL CHECK (length(trim(photographer)) > 0),
  session_type VARCHAR(200) NOT NULL CHECK (length(trim(session_type)) > 0),
  location TEXT,
  notes TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  certificate_id UUID REFERENCES gift_certificates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bookings_time_range CHECK (end_at > start_at),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    (lower(trim(photographer))) WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'scheduled')
);