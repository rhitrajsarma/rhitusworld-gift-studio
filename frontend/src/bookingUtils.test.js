import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPhotographerOverlap, localDateTimeToIso, normalizePhotographerName, toLocalDateTimeInput } from './bookingUtils.js';

test('booking local time input round-trips to the same instant', () => {
  const instant = '2030-05-20T15:45:00.000Z';
  const localInput = toLocalDateTimeInput(instant);
  assert.match(localInput, /^2030-05-20T\d{2}:45$/);
  assert.equal(localDateTimeToIso(localInput), instant);
});

test('booking local time conversion rejects malformed and impossible dates', () => {
  assert.equal(localDateTimeToIso('not-a-time'), null);
  assert.equal(localDateTimeToIso('2030-02-30T12:00'), null);
  assert.equal(toLocalDateTimeInput('not-an-instant'), '');
});

test('photographer overlap checks normalize names and allow adjacent appointments', () => {
  const existing = [{
    id: 'existing', photographer: ' Alice Smith ', status: 'scheduled',
    startAt: '2030-05-20T14:00:00.000Z', endAt: '2030-05-20T15:00:00.000Z'
  }];
  assert.equal(normalizePhotographerName(' Alice Smith '), 'alice smith');
  assert.equal(hasPhotographerOverlap(existing, {
    photographer: 'ALICE SMITH', status: 'scheduled',
    startAt: '2030-05-20T14:30:00.000Z', endAt: '2030-05-20T15:30:00.000Z'
  }), true);
  assert.equal(hasPhotographerOverlap(existing, {
    photographer: 'alice smith', status: 'scheduled',
    startAt: '2030-05-20T15:00:00.000Z', endAt: '2030-05-20T16:00:00.000Z'
  }), false);
});

test('photographer overlap checks ignore cancelled bookings and the edited record', () => {
  const existing = [{
    id: 'existing', photographer: 'Alice', status: 'scheduled',
    startAt: '2030-05-20T14:00:00.000Z', endAt: '2030-05-20T15:00:00.000Z'
  }];
  const candidate = {
    photographer: 'alice', status: 'scheduled',
    startAt: '2030-05-20T14:30:00.000Z', endAt: '2030-05-20T15:30:00.000Z'
  };
  assert.equal(hasPhotographerOverlap(existing, { ...candidate, status: 'cancelled' }), false);
  assert.equal(hasPhotographerOverlap(existing, candidate, 'existing'), false);
  assert.equal(hasPhotographerOverlap(existing, { ...candidate, startAt: 'invalid' }), false);
});
