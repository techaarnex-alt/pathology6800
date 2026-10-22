import { env } from 'cloudflare:workers';
import { PATHOLOGY_CATALOGUE } from '@/lib/pathology-catalogue';
import { ADDITIONAL_REFERRAL_SOURCES } from '@/lib/referral-sources';

export type Branch = {
  id: string;
  short: string;
  name: string;
  reportPrefix: string;
};

export const BRANCHES: Branch[] = [
  { id: 'sarojini', short: 'SN', name: 'ESIS Dispensary Sarojani Nagar, Lucknow', reportPrefix: 'LKO-SN' },
  { id: 'aishbagh', short: 'AB', name: 'ESIS Dispensary Aishbagh, Lucknow', reportPrefix: 'LKO-AB' },
  { id: 'golaganj', short: 'GG', name: 'ESIS Dispensary Golaganj (KGMU), Lucknow', reportPrefix: 'LKO-GG' },
  { id: 'sandeela', short: 'SD', name: 'ESIS Dispensary Sandeela, Hardoi', reportPrefix: 'HRD-SD' },
  { id: 'sitapur', short: 'ST', name: 'ESIS Dispensary Sitapur', reportPrefix: 'STP-ST' },
  { id: 'barabanki', short: 'BB', name: 'ESIS Dispensary Barabanki', reportPrefix: 'BBK-BB' },
  { id: 'raebareli', short: 'RB', name: 'ESIS Dispensary Raebareli', reportPrefix: 'RBL-RB' },
];

type Runtime = { DB: D1Database; LAB_LOGIN_CREDENTIALS?: string };
type SessionRow = { location_id: string; expires_at: number };
type LoginAccount = { locationId: string; username: string; password: string };
type LoginAccountInput = Partial<LoginAccount> & { branchId?: unknown; location?: unknown; user?: unknown; loginId?: unknown };

export const db = () => (env as unknown as Runtime).DB;
export const publicBranch = (branch: Branch) => ({ id: branch.id, short: branch.short, name: branch.name });
export const branchById = (id: string) => BRANCHES.find((branch) => branch.id === id);
export const referralSourceById = (id: string) => branchById(id) ?? ADDITIONAL_REFERRAL_SOURCES.find((source) => source.id === id);

export async function ensurePathologyCatalogue(locationId: string) {
  const createdAt = Date.now();
  await db().batch(PATHOLOGY_CATALOGUE.map((test) => db().prepare(`
    INSERT INTO lab_tests (location_id, name, category, reference_range, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(location_id, name) DO NOTHING
  `).bind(locationId, test.name, test.category, test.referenceRange, createdAt)));
}

export function loginAccount(user: string, password: string) {
  const rawAccounts = (env as unknown as Runtime).LAB_LOGIN_CREDENTIALS?.trim();
  if (!rawAccounts) throw new Error('LAB_LOGIN_CREDENTIALS is not configured.');

  let accounts: unknown;
  try {
    accounts = JSON.parse(rawAccounts);
  } catch {
    throw new Error('LAB_LOGIN_CREDENTIALS must contain valid JSON.');
  }

  // Accept both documented array values and an object keyed by location ID.
  // This prevents one valid but differently-shaped secret from disabling every
  // dispensary login.
  const suppliedAccounts: unknown[] = Array.isArray(accounts)
    ? accounts
    : accounts && typeof accounts === 'object'
      ? Object.entries(accounts as Record<string, unknown>).map(([locationId, value]) => value && typeof value === 'object' ? Object.assign({ locationId }, value as Record<string, unknown>) : value)
      : [];
  if (!suppliedAccounts.length) throw new Error('LAB_LOGIN_CREDENTIALS must contain at least one account.');
  const configuredAccounts = suppliedAccounts.map((item): LoginAccount | null => {
    if (!item || typeof item !== 'object') return null;
    const candidate = item as LoginAccountInput;
    const locationId = typeof candidate.locationId === 'string' ? candidate.locationId : typeof candidate.branchId === 'string' ? candidate.branchId : typeof candidate.location === 'string' ? candidate.location : '';
    const username = typeof candidate.username === 'string' ? candidate.username : typeof candidate.user === 'string' ? candidate.user : typeof candidate.loginId === 'string' ? candidate.loginId : '';
    const passwordValue = typeof candidate.password === 'string' ? candidate.password : '';
    return username.trim() && passwordValue && branchById(locationId) ? { locationId, username: username.trim(), password: passwordValue } : null;
  }).filter((account): account is LoginAccount => Boolean(account));

  const uniqueLocationIds = new Set(configuredAccounts.map((account) => account.locationId));
  const uniqueUsernames = new Set(configuredAccounts.map((account) => account.username.trim().toLowerCase()));
  if (
    !configuredAccounts.length
    || uniqueLocationIds.size !== configuredAccounts.length
    || uniqueUsernames.size !== configuredAccounts.length
  ) throw new Error('LAB_LOGIN_CREDENTIALS contains invalid or duplicate accounts.');

  return configuredAccounts.find((account) => account.username.trim().toLowerCase() === user && account.password === password) ?? null;
}

function cookieValue(request: Request, name: string) {
  const encoded = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  return encoded ? decodeURIComponent(encoded) : null;
}

export async function sessionBranch(request: Request) {
  const token = cookieValue(request, 'esis_lab_session');
  if (!token) return null;
  const session = await db().prepare('SELECT location_id, expires_at FROM lab_sessions WHERE token = ?').bind(token).first<SessionRow>();
  if (!session || session.expires_at <= Date.now()) {
    if (session) await db().prepare('DELETE FROM lab_sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return branchById(session.location_id) ?? null;
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

export function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

// Hosted databases created before the title field was introduced may not have
// received the migration yet. Routes use this to keep the booking workflow
// available while the migration is applied, instead of returning a blank 500.
export function isMissingPatientTitleColumn(error: unknown) {
  return /(no such column|has no column named)\s*:?\s*title/i.test(String(error));
}

export function safeTests(value: unknown) {
  const allowed = new Set(['CBC', 'ESR', 'Peripheral Smear', 'Blood Sugar', 'LFT', 'RFT', 'Lipid Profile', 'HbA1c', 'Thyroid Profile', 'Serum Sodium', 'Serum Potassium', 'Urine Routine', 'Stool Routine']);
  if (!Array.isArray(value)) return [];
  return value.filter((test): test is string => typeof test === 'string' && allowed.has(test)).slice(0, 8);
}
