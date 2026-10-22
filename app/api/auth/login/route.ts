import { branchById, db, json, loginAccount, publicBranch } from '@/lib/server/lab';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { user?: unknown; password?: unknown } | null;
  const user = typeof body?.user === 'string' ? body.user.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  let account;
  try {
    account = loginAccount(user, password);
  } catch (error) {
    console.error('Login configuration error:', error);
    return json({ error: 'Login is temporarily unavailable. Please contact the administrator.' }, 503);
  }
  const branch = account ? branchById(account.locationId) : null;
  if (!branch) return json({ error: 'Invalid login ID or password.' }, 401);
  const token = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  try {
    await db().prepare('INSERT INTO lab_sessions (token, location_id, expires_at) VALUES (?, ?, ?)').bind(token, branch.id, expiresAt).run();
  } catch (error) {
    console.error('Login session error:', error);
    return json({ error: 'Login is temporarily unavailable. Please contact the administrator.' }, 503);
  }
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({ branch: publicBranch(branch) }, 200, { 'set-cookie': `esis_lab_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
}
