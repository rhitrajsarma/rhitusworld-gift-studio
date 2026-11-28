export function toLocalDateTimeInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function localDateTimeToIso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return toLocalDateTimeInput(iso) === value ? iso : null;
}

export function normalizePhotographerName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

export function hasPhotographerOverlap(bookings, candidate, excludeId = null) {
  if (!Array.isArray(bookings) || !candidate || candidate.status !== 'scheduled') return false;
  const photographer = normalizePhotographerName(candidate.photographer);
  const start = Date.parse(candidate.startAt);
  const end = Date.parse(candidate.endAt);
  if (!photographer || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;

  return bookings.some((booking) => {
    if (!booking || booking.id === excludeId || booking.status !== 'scheduled') return false;
    if (normalizePhotographerName(booking.photographer) !== photographer) return false;
    const existingStart = Date.parse(booking.startAt);
    const existingEnd = Date.parse(booking.endAt);
    return Number.isFinite(existingStart) && Number.isFinite(existingEnd) && start < existingEnd && existingStart < end;
  });
}
