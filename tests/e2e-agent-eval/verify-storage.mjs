#!/usr/bin/env node
// Independent, harness-side storage verification via a real authenticated
// session. Discovers every bucket the build created from the LOCAL admin API
// (untruncated names + each bucket's allowed_mime_types — the CLI
// `bucket list` table truncates names to 32 chars and omits MIME types), then
// for each bucket mints a throwaway SDK user and does an authenticated
// upload -> list round-trip using a MIME type the bucket actually allows.
// Mirrors invoke-with-auth.mjs (a throwaway SDK user) but exercises the
// documented `volcano.storage.from(bucket).upload/list` client flow.
//
// Usage: node verify-storage.mjs <apiUrl> <anonKey> <projectId>
// Emits one JSON line per bucket:
//   { bucket, mime, user_scoped_path, uploaded, listed, error }
// Exits 0 iff >=1 bucket accepted an authenticated upload + list round-trip.

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, projectId] = process.argv.slice(2);
if (!apiUrl || !anonKey || !projectId) {
  console.error('usage: verify-storage.mjs <apiUrl> <anonKey> <projectId>');
  process.exit(1);
}

const password = 'Eval-Test-Password-1!';
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
// The server validates the *declared* content-type against the allow-list, so
// a tiny payload with a matching type is enough; the extension is cosmetic.
const extFor = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt' }[mime] || 'bin');

async function roundTrip(bucket, allowed) {
  const email = `e2e-eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { user, session } = await anon.auth.signUp({ email, password, signInWhenAllowed: true });
  if (!session?.access_token) ({ user, session } = await anon.auth.signIn({ email, password }));
  if (!session?.access_token) return { bucket, uploaded: false, listed: false, error: 'could not obtain a session' };

  const volcano = new VolcanoAuth({ apiUrl, anonKey, accessToken: session.access_token });
  const api = volcano.storage.from(bucket);
  // Upload with a MIME type the bucket allows (unrestricted buckets take any).
  const mime = Array.isArray(allowed) && allowed.length ? allowed[0] : 'text/plain';
  // Scope under the user id — the common owner-only RLS path.
  const dir = user?.id || 'eval';
  const path = `${dir}/eval-${Date.now()}.${extFor(mime)}`;

  const up = await api.upload(path, new Blob(['volcano eval storage test\n'], { type: mime }), { contentType: mime });
  if (up?.error) return { bucket, mime, user_scoped_path: path, uploaded: false, listed: false, error: `upload: ${up.error.message || up.error}` };

  const listed = await api.list(dir);
  const files = Array.isArray(listed?.data) ? listed.data : [];
  const found = files.some((f) => (f?.name || '').includes('eval-'));
  return { bucket, mime, user_scoped_path: path, uploaded: true, listed: found, error: listed?.error ? String(listed.error.message || listed.error) : null };
}

try {
  // Local admin API: untruncated names + allowed_mime_types. On localhost this
  // is no-auth; sending the anon/service key is *rejected* ("invalid token").
  const res = await fetch(`${apiUrl}/projects/${projectId}/storage/buckets`);
  const buckets = res.ok ? await res.json() : [];
  if (!Array.isArray(buckets) || buckets.length === 0) {
    emit({ bucket: null, uploaded: false, listed: false, error: `no buckets created (admin API ${res.status})` });
    process.exit(1);
  }

  let anyPass = false;
  for (const b of buckets) {
    let r;
    try { r = await roundTrip(b.name, b.allowed_mime_types); }
    catch (err) { r = { bucket: b.name, uploaded: false, listed: false, error: String(err?.message || err) }; }
    emit(r);
    if (r.uploaded && r.listed) anyPass = true;
  }
  process.exit(anyPass ? 0 : 1);
} catch (err) {
  emit({ bucket: null, uploaded: false, listed: false, error: String(err?.message || err) });
  process.exit(1);
}
