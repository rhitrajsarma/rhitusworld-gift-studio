import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';

test('booking API and database constraints', async (t) => {
  if (!process.env.TEST_DATABASE_URL) return t.skip('Set TEST_DATABASE_URL to a disposable PostgreSQL database');
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let server;
  let certificateId;
  const clientName = `Booking Test ${randomUUID()}`;
  const photographer = `Alice ${randomUUID()}`;
  try {
    const schema = await readFile(new URL('./db/schema.sql', import.meta.url), 'utf8');
    await pool.query(schema);
    await pool.query(schema);
    const certificate = await pool.query(`INSERT INTO gift_certificates
      (code, recipient_name, purchaser_name, package_name, original_amount, remaining_balance, expiration_date)
      VALUES ($1, 'Client', 'Buyer', 'Session', 100, 100, '2030-01-01') RETURNING id`,
    [`TEST-${randomUUID().replaceAll('-', '').slice(0, 27)}`]);
    certificateId = certificate.rows[0].id;
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    server = spawn(process.execPath, ['server.js'], {
      cwd: new URL('.', import.meta.url),
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: String(port) },
      stdio: 'ignore'
    });
    const base = `http://127.0.0.1:${port}/api/bookings`;
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await fetch(base); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'server started');
    async function request(method, body, id = '') {
      const response = await fetch(`${base}${id ? `/${id}` : ''}`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return { status: response.status, body: await response.json() };
    }
    const booking = { clientName, photographer: ` ${photographer} `, sessionType: 'Portrait', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z', certificateId };
    const created = await request('POST', booking);
    assert.equal(created.status, 201);
    assert.equal(created.body.startAt, '2026-01-01T10:00:00.000Z');
    assert.equal(created.body.certificateId, certificateId);
    assert.equal((await request('POST', { ...booking, photographer: photographer.toLowerCase() })).status, 409);
    assert.equal((await request('POST', { ...booking, photographer: photographer.toLowerCase(), startAt: booking.endAt, endAt: '2026-01-01T12:00:00Z' })).status, 201);
    assert.equal((await request('POST', { ...booking, status: 'cancelled' })).status, 201);
    assert.equal((await request('POST', { ...booking, certificateId: '00000000-0000-0000-0000-000000000000', photographer: 'Bob' })).status, 400);
    assert.equal((await request('POST', { ...booking, startAt: '2026-02-30T10:00:00Z' })).status, 400);
    assert.equal((await request('POST', { ...booking, startAt: '2026-01-01T10:00:00+20:00' })).status, 400);
    assert.equal((await request('POST', { ...booking, notes: 'bad\u0000text' })).status, 400);
    assert.equal((await request('PATCH', { endAt: '2026-01-01T09:00:00Z' }, created.body.id)).status, 400);
    assert.equal((await request('PATCH', { status: 'cancelled' }, created.body.id)).status, 200);
    const concurrent = await Promise.all([request('POST', booking), request('POST', { ...booking, photographer: 'ALICE' })]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await request('PATCH', { status: 'scheduled' }, created.body.id)).status, 409);
    assert.equal((await request('PATCH', { notes: 'Updated' }, '00000000-0000-0000-0000-000000000000')).status, 404);
    assert.equal((await request('GET')).body.filter((item) => item.clientName === clientName).length, 4);
    const result = await pool.query('SELECT remaining_balance, (SELECT count(*) FROM certificate_audit_logs WHERE certificate_id = $1) AS audits FROM gift_certificates WHERE id = $1', [certificateId]);
    assert.equal(result.rows[0].remaining_balance, '100.00');
    assert.equal(result.rows[0].audits, '0');
  } finally {
    if (server) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }
    if (certificateId) {
      await pool.query('DELETE FROM bookings WHERE client_name = $1', [clientName]);
      await pool.query('DELETE FROM gift_certificates WHERE id = $1', [certificateId]);
    }
    await pool.end();
  }
});