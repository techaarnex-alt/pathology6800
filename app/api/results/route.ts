import { cleanText, db, isMissingPatientTitleColumn, json, referralSourceById, sessionBranch } from '@/lib/server/lab';

type EntryRow = { id: number; report_number: string; patient: string; title: string; registration_number: string; ip_number: string; age: string; sex: string; relationship: string; ip_holder_name: string; transferred_from_location_id: string | null; created_at: number };
type ResultRow = { id: number; test_name: string; result_value: string; reference_range: string; result_note: string };

function resultPayload(row: ResultRow) {
  return { id: row.id, testName: row.test_name, resultValue: row.result_value, referenceRange: row.reference_range, resultNote: row.result_note };
}

export async function GET(request: Request) {
  const branch = await sessionBranch(request);
  if (!branch) return json({ error: 'Sign in required.' }, 401);
  const entryId = Number(new URL(request.url).searchParams.get('entryId'));
  if (!Number.isInteger(entryId) || entryId < 1) return json({ error: 'Choose a valid test entry.' }, 400);
  let entry: EntryRow | null;
  try {
    entry = await db().prepare('SELECT id, report_number, patient, title, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, created_at FROM lab_entries WHERE id = ? AND location_id = ?').bind(entryId, branch.id).first<EntryRow>();
  } catch (error) {
    if (!isMissingPatientTitleColumn(error)) throw error;
    const legacy = await db().prepare('SELECT id, report_number, patient, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, created_at FROM lab_entries WHERE id = ? AND location_id = ?').bind(entryId, branch.id).first<Omit<EntryRow, 'title'>>();
    entry = legacy ? { ...legacy, title: '' } : null;
  }
  if (!entry) return json({ error: 'This test entry is not available at your location.' }, 404);
  const rows = await db().prepare('SELECT id, test_name, result_value, reference_range, result_note FROM lab_entry_tests WHERE entry_id = ? ORDER BY id').bind(entry.id).all<ResultRow>();
  return json({ entry: { recordId: entry.id, id: entry.report_number, patient: entry.patient, title: entry.title || '', registrationNumber: entry.registration_number, ip: entry.ip_number, age: entry.age, sex: entry.sex, relationship: entry.relationship, ipHolderName: entry.ip_holder_name, transferredFrom: entry.transferred_from_location_id ? referralSourceById(entry.transferred_from_location_id)?.name || '' : '', date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(entry.created_at)) }, results: (rows.results || []).map(resultPayload) });
}

export async function PATCH(request: Request) {
  const branch = await sessionBranch(request);
  if (!branch) return json({ error: 'Sign in required.' }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const entryId = Number(body?.entryId);
  const changes = Array.isArray(body?.results) ? body.results.slice(0, 50) : [];
  if (!Number.isInteger(entryId) || entryId < 1 || !changes.length) return json({ error: 'Choose a test entry and enter at least one result.' }, 400);
  const entry = await db().prepare('SELECT id FROM lab_entries WHERE id = ? AND location_id = ?').bind(entryId, branch.id).first<{ id: number }>();
  if (!entry) return json({ error: 'This test entry is not available at your location.' }, 404);
  const existing = await db().prepare('SELECT id FROM lab_entry_tests WHERE entry_id = ?').bind(entry.id).all<{ id: number }>();
  const allowed = new Set((existing.results || []).map((row) => row.id));
  const updates = changes.map((change) => {
    const item = change as Record<string, unknown>;
    const id = Number(item.id);
    if (!Number.isInteger(id) || !allowed.has(id)) return null;
    return { id, resultValue: cleanText(item.resultValue, 120), referenceRange: cleanText(item.referenceRange, 160), resultNote: cleanText(item.resultNote, 240) };
  }).filter((change): change is { id: number; resultValue: string; referenceRange: string; resultNote: string } => Boolean(change));
  if (!updates.length) return json({ error: 'The submitted results were not valid for this entry.' }, 400);
  const now = Date.now();
  await db().batch(updates.map((change) => db().prepare('UPDATE lab_entry_tests SET result_value = ?, reference_range = ?, result_note = ?, updated_at = ? WHERE id = ? AND entry_id = ?').bind(change.resultValue, change.referenceRange, change.resultNote, now, change.id, entry.id)));
  const latest = await db().prepare('SELECT id, test_name, result_value, reference_range, result_note FROM lab_entry_tests WHERE entry_id = ? ORDER BY id').bind(entry.id).all<ResultRow>();
  return json({ results: (latest.results || []).map(resultPayload) });
}

// Clearing a result retains the booked test and its reference range, so the
// technician can enter a corrected value later without having to re-book the
// patient. Only saved result data is removed.
export async function DELETE(request: Request) {
  const branch = await sessionBranch(request);
  if (!branch) return json({ error: 'Sign in required.' }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const entryId = Number(body?.entryId);
  const resultId = Number(body?.resultId);
  if (!Number.isInteger(entryId) || entryId < 1 || !Number.isInteger(resultId) || resultId < 1) return json({ error: 'Choose a valid saved result.' }, 400);
  const entry = await db().prepare('SELECT id FROM lab_entries WHERE id = ? AND location_id = ?').bind(entryId, branch.id).first<{ id: number }>();
  if (!entry) return json({ error: 'This test entry is not available at your location.' }, 404);
  const cleared = await db().prepare("UPDATE lab_entry_tests SET result_value = '', result_note = '', updated_at = ? WHERE id = ? AND entry_id = ?").bind(Date.now(), resultId, entry.id).run();
  if (!cleared.meta.changes) return json({ error: 'This result was not found in the selected entry.' }, 404);
  const latest = await db().prepare('SELECT id, test_name, result_value, reference_range, result_note FROM lab_entry_tests WHERE entry_id = ? ORDER BY id').bind(entry.id).all<ResultRow>();
  return json({ results: (latest.results || []).map(resultPayload) });
}
