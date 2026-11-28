import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const bookingFields = {
  clientName: ['client_name', 160, true],
  clientEmail: ['client_email', 160],
  clientPhone: ['client_phone', 80],
  photographer: ['photographer', 160, true],
  sessionType: ['session_type', 200, true],
  location: ['location'],
  notes: ['notes'],
  startAt: ['start_at'],
  endAt: ['end_at'],
  status: ['status'],
  certificateId: ['certificate_id']
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validInstant(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(year) >= 100 && Number(month) >= 1 && Number(month) <= 12 &&
    Number(day) >= 1 && Number(day) <= days && Number(hour) <= 23 &&
    Number(minute) <= 59 && Number(second) <= 59 &&
    (zone.toUpperCase() === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)) &&
    Number.isFinite(Date.parse(value));
}

function validateBooking(body, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Expected a booking object';
  if (Object.keys(body).some((key) => !Object.hasOwn(bookingFields, key))) return 'Unknown booking field';
  if (!creating && !Object.keys(body).length) return 'No booking fields provided';
  for (const [key, [, max, required]] of Object.entries(bookingFields)) {
    const value = body[key];
    if (value === undefined) {
      if (creating && (required || key === 'startAt' || key === 'endAt')) return `${key} is required`;
      continue;
    }
    if (key === 'startAt' || key === 'endAt') {
      if (!validInstant(value)) return `${key} must be an ISO timestamp with a timezone`;
    } else if (key === 'status') {
      if (!['scheduled', 'cancelled'].includes(value)) return 'Invalid status';
    } else if (key === 'certificateId') {
      if (value !== null && (typeof value !== 'string' || !uuidPattern.test(value))) return 'Invalid certificateId';
    } else if (value === null && !required) {
      continue;
    } else if (typeof value !== 'string' || (required && !value.trim()) || (max && value.length > max) || value.includes('\0')) {
      return `Invalid ${key}`;
    }
  }
  if (body.startAt !== undefined && body.endAt !== undefined && Date.parse(body.endAt) <= Date.parse(body.startAt)) {
    return 'endAt must be after startAt';
  }
  return null;
}

function bookingResponse(row) {
  return {
    id: row.id, clientName: row.client_name, clientEmail: row.client_email,
    clientPhone: row.client_phone, photographer: row.photographer, sessionType: row.session_type,
    location: row.location, notes: row.notes, startAt: row.start_at, endAt: row.end_at,
    status: row.status, certificateId: row.certificate_id, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function bookingError(res, err) {
  if (err.code === '23P01') return res.status(409).json({ error: 'Photographer already has a booking during this time' });
  if (err.code === '23503') return res.status(400).json({ error: 'Certificate not found' });
  if (err.code === '23514' || err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Invalid booking values or time range' });
  console.error(err);
  return res.status(500).json({ error: 'Unable to process booking' });
}

app.get('/api/bookings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bookings ORDER BY start_at, id');
    res.json(rows.map(bookingResponse));
  } catch (err) {
    bookingError(res, err);
  }
});

app.post('/api/bookings', async (req, res) => {
  const error = validateBooking(req.body, true);
  if (error) return res.status(400).json({ error });
  const keys = Object.keys(req.body);
  const columns = keys.map((key) => bookingFields[key][0]);
  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (${columns.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      keys.map((key) => req.body[key])
    );
    res.status(201).json(bookingResponse(rows[0]));
  } catch (err) {
    bookingError(res, err);
  }
});

app.patch('/api/bookings/:id', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(400).json({ error: 'Invalid booking id' });
  const error = validateBooking(req.body, false);
  if (error) return res.status(400).json({ error });
  const keys = Object.keys(req.body);
  try {
    const { rows } = await pool.query(
      `UPDATE bookings SET ${keys.map((key, i) => `${bookingFields[key][0]} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...keys.map((key) => req.body[key]), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    res.json(bookingResponse(rows[0]));
  } catch (err) {
    bookingError(res, err);
  }
});

// GET /api/certificates — Retrieve all gift certificates with ordered audit logs
app.get('/api/certificates', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'action', a.action,
              'amount', a.amount::float,
              'note', a.note,
              'timestamp', a.created_at
            ) ORDER BY a.created_at ASC
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS "auditHistory"
      FROM gift_certificates c
      LEFT JOIN certificate_audit_logs a ON a.certificate_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        recipientName: r.recipient_name,
        recipientEmail: r.recipient_email,
        purchaserName: r.purchaser_name,
        purchaserEmail: r.purchaser_email,
        packageName: r.package_name,
        packageDescription: r.package_description,
        originalAmount: Number(r.original_amount),
        remainingBalance: Number(r.remaining_balance),
        issueDate: r.issue_date.toISOString().split('T')[0],
        expirationDate: r.expiration_date.toISOString().split('T')[0],
        authorizedPhotographer: r.authorized_photographer,
        personalMessage: r.personal_message,
        theme: r.theme,
        isVoided: r.is_voided,
        auditHistory: r.auditHistory
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/certificates — Issue & activate a new gift certificate
app.post('/api/certificates', async (req, res) => {
  const c = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO gift_certificates (
        code, recipient_name, recipient_email, purchaser_name, purchaser_email,
        package_name, package_description, original_amount, remaining_balance,
        issue_date, expiration_date, authorized_photographer, personal_message, theme
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id`,
      [
        c.code,
        c.recipientName,
        c.recipientEmail,
        c.purchaserName,
        c.purchaserEmail,
        c.packageName,
        c.packageDescription,
        c.originalAmount,
        c.remainingBalance,
        c.issueDate,
        c.expirationDate,
        c.authorizedPhotographer,
        c.personalMessage,
        c.theme
      ]
    );

    await client.query(
      'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,$3,$4)',
      [rows[0].id, 'Issued', c.originalAmount, `Issued to ${c.recipientName}`]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/certificates/:id/redeem — Record partial or full session redemption
app.post('/api/certificates/:id/redeem', async (req, res) => {
  const { amount, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE gift_certificates SET remaining_balance = GREATEST(0, remaining_balance - $1), updated_at = NOW() WHERE id = $2 RETURNING remaining_balance',
      [amount, req.params.id]
    );
    if (!rows.length) throw new Error('Certificate not found');

    const action = Number(rows[0].remaining_balance) === 0 ? 'Fully Redeemed' : 'Partial Redemption';
    await client.query(
      'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,$3,$4)',
      [req.params.id, action, amount, note || '']
    );

    await client.query('COMMIT');
    res.json({ ok: true, remainingBalance: Number(rows[0].remaining_balance) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/certificates/:id — Extend expiration, void, or reactivate
app.patch('/api/certificates/:id', async (req, res) => {
  const { expirationDate, isVoided, auditAction, auditNote } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (expirationDate !== undefined) {
      await client.query(
        'UPDATE gift_certificates SET expiration_date = $1, updated_at = NOW() WHERE id = $2',
        [expirationDate, req.params.id]
      );
    }
    if (isVoided !== undefined) {
      await client.query(
        'UPDATE gift_certificates SET is_voided = $1, updated_at = NOW() WHERE id = $2',
        [isVoided, req.params.id]
      );
    }
    if (auditAction) {
      await client.query(
        'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,0,$3)',
        [req.params.id, auditAction, auditNote || '']
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`Rhitusworld PostgreSQL API running on http://localhost:${PORT}`);
});