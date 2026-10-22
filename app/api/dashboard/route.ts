import { db, isMissingPatientTitleColumn, json, publicBranch, referralSourceById, sessionBranch } from '@/lib/server/lab';

type EntryRow = { id: number; report_number: string; patient: string; title: string; registration_number: string; ip_number: string; age: string; sex: string; relationship: string; ip_holder_name: string; transferred_from_location_id: string | null; source_entry_id: number | null; tests_json: string; created_at: number };
type ReviewRow = { id: number; rating: number; reviewer_name: string; message: string; created_at: number };

export async function GET(request: Request) {
  const branch = await sessionBranch(request);
  if (!branch) return json({ error: 'Sign in required.' }, 401);
  let entryResult;
  let reviewResult;
  try {
    [entryResult, reviewResult] = await db().batch([
      db().prepare('SELECT id, report_number, patient, title, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, source_entry_id, tests_json, created_at FROM lab_entries WHERE location_id = ? ORDER BY created_at DESC LIMIT 100').bind(branch.id),
      db().prepare('SELECT id, rating, reviewer_name, message, created_at FROM customer_reviews WHERE location_id = ? ORDER BY created_at DESC LIMIT 50').bind(branch.id),
    ]);
  } catch (error) {
    if (!isMissingPatientTitleColumn(error)) throw error;
    [entryResult, reviewResult] = await db().batch([
      db().prepare('SELECT id, report_number, patient, registration_number, ip_number, age, sex, relationship, ip_holder_name, transferred_from_location_id, source_entry_id, tests_json, created_at FROM lab_entries WHERE location_id = ? ORDER BY created_at DESC LIMIT 100').bind(branch.id),
      db().prepare('SELECT id, rating, reviewer_name, message, created_at FROM customer_reviews WHERE location_id = ? ORDER BY created_at DESC LIMIT 50').bind(branch.id),
    ]);
  }
  const entries = (entryResult.results as unknown as EntryRow[]).map((entry) => ({ recordId: entry.id, id: entry.report_number, patient: entry.patient, title: entry.title || '', registrationNumber: entry.registration_number, ip: entry.ip_number, age: entry.age, sex: entry.sex, relationship: entry.relationship, ipHolderName: entry.ip_holder_name, transferredFrom: entry.transferred_from_location_id ? referralSourceById(entry.transferred_from_location_id)?.name || '' : '', sourceEntryId: entry.source_entry_id, tests: JSON.parse(entry.tests_json) as string[], date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(entry.created_at)) }));
  const reviews = (reviewResult.results as unknown as ReviewRow[]).map((review) => ({ id: review.id, rating: review.rating, reviewerName: review.reviewer_name, message: review.message, date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(review.created_at)) }));
  return json({ branch: publicBranch(branch), entries, reviews });
}
