#!/usr/bin/env node
// Independent, harness-side verification of a storage bucket via a real
// authenticated session: upload a small file, then list it back. Mirrors
// invoke-with-auth.mjs (a throwaway SDK user), but exercises the documented
// `volcano.storage.from(bucket).upload/list` client flow instead of functions.
//
// Usage: node verify-storage.mjs <apiUrl> <anonKey> <bucket>
// Emits JSON: { bucket, user_scoped_path, uploaded, listed, error }

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, bucket] = process.argv.slice(2);
if (!apiUrl || !anonKey || !bucket) {
  console.error('usage: verify-storage.mjs <apiUrl> <anonKey> <bucket>');
  process.exit(1);
}

const email = `e2e-eval-${Date.now()}@example.com`;
const password = 'Eval-Test-Password-1!';

function emit(o) { process.stdout.write(JSON.stringify({ bucket, ...o }) + '\n'); }

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { user, session } = await anon.auth.signUp({ email, password, signInWhenAllowed: true });
  if (!session?.access_token) ({ user, session } = await anon.auth.signIn({ email, password }));
  if (!session?.access_token) { emit({ uploaded: false, listed: false, error: 'could not obtain a session' }); process.exit(0); }

  const volcano = new VolcanoAuth({ apiUrl, anonKey, accessToken: session.access_token });
  // Scope under the user id — the common RLS pattern (owner-only paths). If the
  // app used a different policy, upload still tells us whether writes work.
  const path = `${user?.id || 'eval'}/eval-${Date.now()}.txt`;
  const bucketApi = volcano.storage.from(bucket);

  const up = await bucketApi.upload(path, new Blob(['volcano eval storage test\n'], { type: 'text/plain' }), { contentType: 'text/plain' });
  if (up?.error) { emit({ user_scoped_path: path, uploaded: false, listed: false, error: `upload: ${up.error.message || up.error}` }); process.exit(0); }

  const listed = await bucketApi.list(path.split('/')[0]);
  const files = Array.isArray(listed?.data) ? listed.data : [];
  const found = files.some((f) => (f?.name || '').includes('eval-'));
  emit({ user_scoped_path: path, uploaded: true, listed: found, error: listed?.error ? String(listed.error.message || listed.error) : null });
} catch (err) {
  emit({ uploaded: false, listed: false, error: String(err?.message || err) });
}
