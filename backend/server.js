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