import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock3, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { hasPhotographerOverlap, localDateTimeToIso, toLocalDateTimeInput } from './bookingUtils.js';

const LOCAL_BOOKINGS_KEY = 'rhitusworld_local_bookings_v1';

const createEmptyForm = () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    photographer: '',
    sessionType: '',
    location: '',
    notes: '',
    startAt: toLocalDateTimeInput(start.toISOString()),
    endAt: toLocalDateTimeInput(end.toISOString()),
    status: 'scheduled',
    certificateId: ''
  };
};

function readLocalBookings() {
  try {
    const stored = window.localStorage.getItem(LOCAL_BOOKINGS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed) || parsed.some((booking) => !booking || typeof booking.id !== 'string' || typeof booking.startAt !== 'string' || typeof booking.endAt !== 'string')) {
      throw new Error('Local booking data has an invalid format.');
    }
    return { bookings: parsed, error: '' };
  } catch (_) {
    return { bookings: [], error: 'Local bookings could not be read. Saving is disabled to protect existing data.' };
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    let body = {};
    try {
      body = await response.json();
    } catch (_) {}
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatBookingTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Invalid time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function BookingField({ label, id, children }) {
  return (
    <div>
      <label className="booking-field-label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export default function BookingWorkspace({ apiConfig, localCertificates = [] }) {
  const apiUrl = (apiConfig?.baseUrl || '').replace(/\/$/, '');
  const apiEnabled = apiConfig?.mode !== 'local' && Boolean(apiUrl);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your browser time zone';
  const [bookings, setBookings] = useState([]);
  const [localData] = useState(readLocalBookings);
  const [localBookings, setLocalBookings] = useState(localData.bookings);
  const [serverCertificates, setServerCertificates] = useState([]);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [serverStatusKnown, setServerStatusKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editingOrigin, setEditingOrigin] = useState('');
  const [useLocalMode, setUseLocalMode] = useState(false);
  const [confirmLocalOnly, setConfirmLocalOnly] = useState(false);
  const [form, setForm] = useState(createEmptyForm);
  const [connectionError, setConnectionError] = useState('');
  const [certificateError, setCertificateError] = useState('');
  const [localStorageError, setLocalStorageError] = useState(localData.error);
  const [feedback, setFeedback] = useState(null);
  const formOrigin = editingId
    ? editingOrigin
    : !serverStatusKnown || (serverAvailable && !useLocalMode) ? 'server' : 'local';
  const formDisabled = (formOrigin === 'server' && !serverAvailable) || (formOrigin === 'local' && Boolean(localData.error)) || saving;
  const previousOrigin = useRef(formOrigin);

  useEffect(() => {
    if (previousOrigin.current !== formOrigin && !editingId) {
      setForm((current) => ({ ...current, certificateId: '' }));
      setConfirmLocalOnly(false);
    }
    previousOrigin.current = formOrigin;
  }, [formOrigin, editingId]);

  const loadServerData = useCallback(async () => {
    if (!apiEnabled) {
      setServerAvailable(false);
      setConnectionError('The API is set to local-only mode. Server bookings are not available.');
      setServerCertificates([]);
      setLoading(false);
      setServerStatusKnown(true);
      return;
    }

    setLoading(true);
    setCertificateError('');
    try {
      const data = await requestJson(`${apiUrl}/bookings`);
      if (Array.isArray(data)) {
        setBookings(data);
        setServerAvailable(true);
        setConnectionError('');
      } else {
        setServerAvailable(false);
        setConnectionError('The bookings endpoint returned an invalid response.');
      }
    } catch (error) {
      setServerAvailable(false);
      setConnectionError(error.message || 'Unable to load server bookings.');
    }

    try {
      const data = await requestJson(`${apiUrl}/certificates`);
      if (Array.isArray(data)) {
        setServerCertificates(data);
      } else {
        setServerCertificates([]);
        setCertificateError('The certificates endpoint returned an invalid response.');
      }
    } catch (error) {
      setServerCertificates([]);
      setCertificateError(error.message || 'Unable to load server certificates.');
    }
    setLoading(false);
    setServerStatusKnown(true);
  }, [apiEnabled, apiUrl]);

  useEffect(() => {
    void loadServerData();
  }, [loadServerData]);

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [bookings]
  );
  const sortedLocalBookings = useMemo(
    () => [...localBookings].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [localBookings]
  );
  const serverCertificateById = useMemo(
    () => new Map(serverCertificates.map((certificate) => [certificate.id, certificate])),
    [serverCertificates]
  );
  const localCertificateById = useMemo(
    () => new Map(localCertificates.map((certificate) => [certificate.id, certificate])),
    [localCertificates]
  );

  const persistLocalBookings = (nextBookings) => {
    if (localData.error) return false;
    try {
      window.localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(nextBookings));
      setLocalBookings(nextBookings);
      setLocalStorageError('');
      return true;
    } catch (error) {
      setLocalStorageError(error.message || 'Browser storage is unavailable.');
      return false;
    }
  };

  const resetForm = () => {
    setEditingId('');
    setEditingOrigin('');
    setConfirmLocalOnly(false);
    setForm(createEmptyForm());
  };

  const beginEdit = (booking, origin) => {
    setEditingId(booking.id);
    setEditingOrigin(origin);
    setUseLocalMode(origin === 'local');
    setConfirmLocalOnly(false);
    setForm({
      clientName: booking.clientName || '',
      clientEmail: booking.clientEmail || '',
      clientPhone: booking.clientPhone || '',
      photographer: booking.photographer || '',
      sessionType: booking.sessionType || '',
      location: booking.location || '',
      notes: booking.notes || '',
      startAt: toLocalDateTimeInput(booking.startAt),
      endAt: toLocalDateTimeInput(booking.endAt),
      status: booking.status || 'scheduled',
      certificateId: (origin === 'local' ? booking.localCertificateId : booking.certificateId) || ''
    });
    setFeedback(null);
  };

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const saveBooking = async (event) => {
    event.preventDefault();
    if (saving || (formOrigin === 'server' && !serverAvailable)) return;

    const startAt = localDateTimeToIso(form.startAt);
    const endAt = localDateTimeToIso(form.endAt);
    if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) {
      setFeedback({ type: 'error', message: 'Enter valid start and end times; the end must be after the start.' });
      return;
    }
    if (!form.clientName.trim() || !form.photographer.trim() || !form.sessionType.trim()) {
      setFeedback({ type: 'error', message: 'Client name, photographer and session type are required.' });
      return;
    }

    const payload = {
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim(),
      clientPhone: form.clientPhone.trim(),
      photographer: form.photographer.trim(),
      sessionType: form.sessionType.trim(),
      location: form.location.trim(),
      notes: form.notes.trim(),
      startAt,
      endAt,
      status: form.status,
      certificateId: form.certificateId || null
    };

    if (formOrigin === 'local') {
      if (!confirmLocalOnly) {
        setFeedback({ type: 'error', message: 'Confirm that this booking will stay only in this browser before saving it locally.' });
        return;
      }
      const existing = editingOrigin === 'local' ? localBookings.find((booking) => booking.id === editingId) : null;
      if (editingId && editingOrigin === 'local' && !existing) {
        setFeedback({ type: 'error', message: 'This local booking is no longer available in browser storage. Refresh the page before trying again.' });
        return;
      }
      if (payload.status === 'scheduled' && hasPhotographerOverlap([...bookings, ...localBookings], payload, existing?.id)) {
        setFeedback({ type: 'error', message: 'This overlaps another visible active booking for this photographer. Local conflict checks cannot see bookings on other devices.' });
        return;
      }

      const now = new Date().toISOString();
      const { certificateId, ...localPayload } = payload;
      const localBooking = {
        ...localPayload,
        id: existing?.id || `local-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
        localCertificateId: certificateId,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      const nextBookings = existing
        ? localBookings.map((booking) => booking.id === existing.id ? localBooking : booking)
        : [localBooking, ...localBookings];
      if (!persistLocalBookings(nextBookings)) {
        setFeedback({ type: 'error', message: `Could not save this booking in browser storage: ${localStorageError || 'storage is unavailable.'}` });
        return;
      }
      setFeedback({ type: 'success', message: 'Saved as a local-only booking on this browser. It will not sync to the server or other devices.' });
      resetForm();
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const result = await requestJson(`${apiUrl}/bookings${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      setBookings((current) => editingId
        ? current.map((booking) => booking.id === result.id ? result : booking)
        : [result, ...current]);
      setFeedback({ type: 'success', message: 'Booking saved on the server.' });
      resetForm();
      await loadServerData();
    } catch (error) {
      const outcomeUnknown = !error.status || error.status >= 500;
      setFeedback({
        type: 'error',
        message: outcomeUnknown
          ? 'The server outcome is unknown. Refresh the server schedule and check for this booking before trying again.'
          : `Booking was not saved: ${error.message}`
      });
      await loadServerData();
    } finally {
      setSaving(false);
    }
  };

  const cancelBooking = async (booking) => {
    if (!serverAvailable || saving) return;
    if (!window.confirm(`Cancel the session for ${booking.clientName}?`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await requestJson(`${apiUrl}/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' })
      });
      setBookings((current) => current.map((item) => item.id === result.id ? result : item));
      setFeedback({ type: 'success', message: 'Booking cancelled on the server.' });
      await loadServerData();
    } catch (error) {
      const outcomeUnknown = !error.status || error.status >= 500;
      setFeedback({
        type: 'error',
        message: outcomeUnknown
          ? 'The server outcome is unknown. Refresh the schedule and check the booking status before trying again.'
          : `Booking was not cancelled: ${error.message}`
      });
      await loadServerData();
    } finally {
      setSaving(false);
    }
  };

  const cancelLocalBooking = (booking) => {
    if (saving || !window.confirm(`Cancel the local-only session for ${booking.clientName}?`)) return;
    const now = new Date().toISOString();
    const nextBookings = localBookings.map((item) => item.id === booking.id
      ? { ...item, status: 'cancelled', updatedAt: now }
      : item);
    if (persistLocalBookings(nextBookings)) {
      setFeedback({ type: 'success', message: 'Local-only booking cancelled in this browser.' });
    } else {
      setFeedback({ type: 'error', message: `Could not update browser storage: ${localStorageError || 'storage is unavailable.'}` });
    }
  };

  const renderBookingCard = (booking, origin) => {
    const isLocal = origin === 'local';
    const certificateId = isLocal ? booking.localCertificateId : booking.certificateId;
    const certificate = certificateId
      ? (isLocal ? localCertificateById : serverCertificateById).get(certificateId)
      : null;
    return (
      <article key={`${origin}-${booking.id}`} className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h4 className="font-semibold text-sm text-[#1C1C1E]">{booking.clientName}</h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${booking.status === 'cancelled' ? 'bg-stone-100 text-stone-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {booking.status}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${isLocal ? 'bg-amber-100 text-amber-900' : 'bg-[#F3F1EC] text-[#52525B]'}`}>
                {isLocal ? 'Local-only · this browser' : 'Server'}
              </span>
            </div>
            <p className="text-xs text-[#52525B] mt-1">{booking.sessionType} · Photographer: {booking.photographer}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => beginEdit(booking, origin)}
              disabled={(!isLocal && !serverAvailable) || saving}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs text-[#52525B] hover:text-[#1C1C1E] hover:bg-[#F3F1EC] disabled:opacity-50 inline-flex items-center gap-1.5"
              aria-label={`Edit booking for ${booking.clientName}`}
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            {booking.status === 'scheduled' && (
              <button
                type="button"
                onClick={() => (isLocal ? cancelLocalBooking(booking) : cancelBooking(booking))}
                disabled={(!isLocal && !serverAvailable) || saving}
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs text-[#52525B]">
          <p className="inline-flex items-start gap-1.5"><Clock3 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#A8843E]" />{formatBookingTime(booking.startAt)} – {formatBookingTime(booking.endAt)}</p>
          <p>{booking.location || 'Location not specified'}</p>
          {(booking.clientEmail || booking.clientPhone) && <p>{[booking.clientEmail, booking.clientPhone].filter(Boolean).join(' · ')}</p>}
          <p>{certificate ? `${isLocal ? 'Local certificate' : 'Certificate'}: ${certificate.code}` : certificateId ? `Linked ${isLocal ? 'local' : 'server'} certificate unavailable` : 'No certificate linked'}</p>
        </div>
        {booking.notes && <p className="mt-2 text-xs text-[#71717A] whitespace-pre-wrap">{booking.notes}</p>}
      </article>
    );
  };

  const inputClass = 'booking-field-input';

  return (
    <section className="booking-workspace space-y-6" aria-labelledby="booking-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#A8843E] font-semibold">Studio schedule</p>
          <h2 id="booking-heading" className="font-serif text-3xl font-semibold text-[#1C1C1E] mt-1">Photo session bookings</h2>
          <p className="text-sm text-[#52525B] mt-1">Staff-managed appointments. Booking a session does not redeem a gift certificate.</p>
        </div>
        <button
          type="button"
          onClick={loadServerData}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl border border-stone-200 bg-white hover:bg-[#F3F1EC] disabled:opacity-50 text-xs font-medium text-[#1C1C1E] inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh schedule
        </button>
      </div>

      <div className={`rounded-2xl border p-4 text-sm ${serverAvailable ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`} role={serverAvailable ? 'status' : 'alert'}>
        <div className="font-semibold">{serverAvailable ? 'Server schedule connected' : 'Server schedule unavailable'}</div>
        <p className="mt-1 text-xs leading-relaxed">
          {serverAvailable
            ? `Times are displayed in ${timeZone}. Server bookings are shared through the configured API.`
            : `${connectionError || 'Unable to reach the booking API.'} Server bookings cannot be changed until the connection returns.${bookings.length ? ' Showing last loaded server records; they may be stale.' : ''}`}
        </p>
        {(!serverAvailable || localBookings.length > 0) && (
          <p className="mt-2 text-xs leading-relaxed font-medium">
            Local-only bookings stay in this browser and are never synchronized. Conflict checks can only use records visible here; while offline, server bookings or changes on other devices may be missing.
          </p>
        )}
      </div>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-6 items-start">
        <section className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden" aria-labelledby="schedule-list-heading">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-100">
            <div>
              <h3 id="schedule-list-heading" className="font-serif text-xl font-semibold text-[#1C1C1E]">Schedule</h3>
              <p className="text-xs text-[#71717A] mt-0.5">Server and browser-local records are kept separate.</p>
            </div>
            <CalendarDays className="w-5 h-5 text-[#A8843E]" aria-hidden="true" />
          </div>
          <div>
            <div className="px-5 py-3 bg-[#FAF9F6]/70 border-b border-stone-100">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52525B]">Server bookings · {sortedBookings.length}</h4>
            </div>
            {loading && bookings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#71717A]">Loading server schedule…</p>
            ) : sortedBookings.length ? (
              <div className="divide-y divide-stone-100">{sortedBookings.map((booking) => renderBookingCard(booking, 'server'))}</div>
            ) : (
              <p className="px-5 py-6 text-sm text-[#71717A]">No server bookings loaded.</p>
            )}
          </div>
          <div className="border-t border-stone-200">
            <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-100">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-950">Local-only · this browser · {sortedLocalBookings.length}</h4>
              <p className="text-xs text-amber-900 mt-1">These records are stored separately and are never uploaded automatically.</p>
            </div>
            {sortedLocalBookings.length ? (
              <div className="divide-y divide-stone-100">{sortedLocalBookings.map((booking) => renderBookingCard(booking, 'local'))}</div>
            ) : (
              <p className="px-5 py-6 text-sm text-[#71717A]">{localData.error ? 'Browser-local bookings could not be loaded.' : 'No browser-local bookings on this device.'}</p>
            )}
          </div>
        </section>

        <form onSubmit={saveBooking} className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-5 space-y-4" aria-labelledby="booking-form-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="booking-form-heading" className="font-serif text-xl font-semibold text-[#1C1C1E]">{editingId ? 'Update booking' : 'New booking'}</h3>
              <p className="text-xs text-[#71717A] mt-0.5">All times use {timeZone}.</p>
            </div>
            {editingId && <button type="button" onClick={resetForm} className="text-xs text-[#52525B] hover:text-[#1C1C1E]">Clear edit</button>}
          </div>

          {!editingId ? (
            <fieldset className="rounded-xl border border-stone-200 p-3 space-y-2" disabled={!serverStatusKnown || saving}>
              <legend className="px-1 text-xs font-semibold text-[#52525B]">Save location</legend>
              <label className="flex items-start gap-2 text-xs text-[#52525B]">
                <input type="radio" name="booking-origin" checked={formOrigin === 'server'} onChange={() => { setUseLocalMode(false); setConfirmLocalOnly(false); setForm((current) => ({ ...current, certificateId: '' })); setFeedback(null); }} disabled={!serverAvailable} />
                <span><strong className="text-[#1C1C1E]">Shared server schedule</strong> · available to connected staff.</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-[#52525B]">
                <input type="radio" name="booking-origin" checked={formOrigin === 'local'} onChange={() => { setUseLocalMode(true); setConfirmLocalOnly(false); setForm((current) => ({ ...current, certificateId: '' })); setFeedback(null); }} />
                <span><strong className="text-[#1C1C1E]">This browser only</strong> · never uploaded automatically.</span>
              </label>
            </fieldset>
          ) : (
            <div className={`rounded-xl border px-3 py-2 text-xs font-medium ${formOrigin === 'local' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-stone-200 bg-[#FAF9F6] text-[#52525B]'}`}>
              Editing a {formOrigin === 'local' ? 'local-only booking stored in this browser' : 'server booking'}; its origin will not change when saved.
            </div>
          )}

          {formOrigin === 'local' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="alert">
              <p className="font-semibold">Local-only booking — limited conflict protection</p>
              <p className="mt-1 leading-relaxed">This record stays in this browser and will not sync to the server or other devices. The overlap check sees only bookings currently loaded here; while offline, other server appointments may be missing.</p>
              <label className="mt-2 flex items-start gap-2 font-medium">
                <input type="checkbox" checked={confirmLocalOnly} onChange={(event) => setConfirmLocalOnly(event.target.checked)} />
                <span>I understand this appointment is local-only and may conflict with bookings not visible here.</span>
              </label>
            </div>
          )}

          {localStorageError && <p className="text-xs text-rose-700" role="alert">Browser storage error: {localStorageError}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BookingField label="Client name *" id="booking-client-name">
              <input id="booking-client-name" className={inputClass} value={form.clientName} onChange={(event) => updateForm('clientName', event.target.value)} maxLength={160} required disabled={formDisabled} />
            </BookingField>
            <BookingField label="Photographer *" id="booking-photographer">
              <input id="booking-photographer" className={inputClass} value={form.photographer} onChange={(event) => updateForm('photographer', event.target.value)} maxLength={160} required disabled={formDisabled} />
            </BookingField>
            <BookingField label="Client email" id="booking-client-email">
              <input id="booking-client-email" type="email" className={inputClass} value={form.clientEmail} onChange={(event) => updateForm('clientEmail', event.target.value)} maxLength={160} disabled={formDisabled} />
            </BookingField>
            <BookingField label="Client phone" id="booking-client-phone">
              <input id="booking-client-phone" type="tel" className={inputClass} value={form.clientPhone} onChange={(event) => updateForm('clientPhone', event.target.value)} maxLength={80} disabled={formDisabled} />
            </BookingField>
            <BookingField label="Session type *" id="booking-session-type">
              <input id="booking-session-type" className={inputClass} value={form.sessionType} onChange={(event) => updateForm('sessionType', event.target.value)} maxLength={200} required disabled={formDisabled} />
            </BookingField>
            <BookingField label="Location" id="booking-location">
              <input id="booking-location" className={inputClass} value={form.location} onChange={(event) => updateForm('location', event.target.value)} disabled={formDisabled} />
            </BookingField>
            <BookingField label="Start time (local) *" id="booking-start-at">
              <input id="booking-start-at" type="datetime-local" className={inputClass} value={form.startAt} onChange={(event) => updateForm('startAt', event.target.value)} required disabled={formDisabled} />
            </BookingField>
            <BookingField label="End time (local) *" id="booking-end-at">
              <input id="booking-end-at" type="datetime-local" className={inputClass} value={form.endAt} onChange={(event) => updateForm('endAt', event.target.value)} required disabled={formDisabled} />
            </BookingField>
            <BookingField label="Status" id="booking-status">
              <select id="booking-status" className={inputClass} value={form.status} onChange={(event) => updateForm('status', event.target.value)} disabled={formDisabled}>
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </BookingField>
            <BookingField label="Gift certificate (optional)" id="booking-certificate">
              <select id="booking-certificate" className={inputClass} value={form.certificateId} onChange={(event) => updateForm('certificateId', event.target.value)} disabled={formDisabled || (formOrigin === 'server' && Boolean(certificateError))}>
                <option value="">No certificate linked</option>
                {(formOrigin === 'local' ? localCertificates : serverCertificates).map((certificate) => (
                  <option key={certificate.id} value={certificate.id}>{certificate.code} · {certificate.recipientName}</option>
                ))}
              </select>
            </BookingField>
          </div>
          {formOrigin === 'server' && certificateError && <p className="text-xs text-amber-800" role="status">Server certificate options could not be loaded: {certificateError}</p>}
          <BookingField label="Notes" id="booking-notes">
            <textarea id="booking-notes" className={`${inputClass} min-h-20 resize-y`} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} disabled={formDisabled} />
          </BookingField>
          <div className="rounded-xl bg-[#FAF9F6] border border-stone-100 px-3 py-2.5 text-[11px] leading-relaxed text-[#71717A]">
            Linking a certificate does not redeem credit or change its balance. {formOrigin === 'local' ? 'Browser-local overlap checks only cover bookings visible on this device.' : 'Server-side overlap checks prevent conflicting active bookings for a photographer.'}
          </div>
          <button
            type="submit"
            disabled={formDisabled || (formOrigin === 'local' && !confirmLocalOnly)}
            className="w-full px-4 py-2.5 rounded-xl bg-[#1C1C1E] text-white text-sm font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex justify-center items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {saving ? 'Saving…' : editingId ? 'Save changes' : formOrigin === 'local' ? 'Create local-only booking' : 'Create server booking'}
          </button>
        </form>
      </div>
    </section>
  );
}
