import { cleanText, db, isMissingPatientTitleColumn, json, referralSourceById, sessionBranch } from '@/lib/server/lab';

type EntryRow = { id: number; report_number: string; patient: string; title: string; registration_number: string; ip_number: string; age: string; sex: string; relationship: string; ip_holder_name: string; transferred_from_location_id: string | null; source_entry_id: number | null; tests_json: string; created_at: number };

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function GET(request: Request) {
  const branch = await sessionBranch(request);
  if (!branch) return json({ error: 'Sign in required.' }, 401);

  const search = cleanText(new URL(request.url).searchParams.get('q'), 100);
  if (!search) return json({ error: 'Enter a patient, registration, IP, or report number.' }, 400);

  const pattern = `%${escapeLike(search)}%`;
  let result;
  try {
    result = await db().prepare(`
    SELECT id, report_number, patient, title, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, source_entry_id, tests_json, created_at
    FROM lab_entries
    WHERE location_id = ?
      AND (
        registration_number COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR patient COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR ip_number COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR report_number COLLATE NOCASE LIKE ? ESCAPE char(92)
      )
    ORDER BY created_at DESC
    LIMIT 100
    `).bind(branch.id, pattern, pattern, pattern, pattern).all<EntryRow>();
  } catch (error) {
    if (!isMissingPatientTitleColumn(error)) throw error;
    result = await db().prepare(`
      SELECT id, report_number, patient, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, source_entry_id, tests_json, created_at
      FROM lab_entries
      WHERE location_id = ? AND (registration_number COLLATE NOCASE LIKE ? ESCAPE char(92) OR patient COLLATE NOCASE LIKE ? ESCAPE char(92) OR ip_number COLLATE NOCASE LIKE ? ESCAPE char(92) OR report_number COLLATE NOCASE LIKE ? ESCAPE char(92))
      ORDER BY created_at DESC LIMIT 100
    `).bind(branch.id, pattern, pattern, pattern, pattern).all<EntryRow>();
  }

  const entries = (result.results || []).map((entry) => ({
    recordId: entry.id,
    id: entry.report_number,
    patient: entry.patient,
    title: entry.title || '',
    registrationNumber: entry.registration_number,
    ip: entry.ip_number,
    age: entry.age,
    sex: entry.sex,
    relationship: entry.relationship,
    ipHolderName: entry.ip_holder_name,
    transferredFrom: entry.transferred_from_location_id ? referralSourceById(entry.transferred_from_location_id)?.name || '' : '',
    sourceEntryId: entry.source_entry_id,
    tests: JSON.parse(entry.tests_json) as string[],
    date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(entry.created_at)),
  }));

  return json({ entries });
}
