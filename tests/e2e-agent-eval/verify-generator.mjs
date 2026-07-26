#!/usr/bin/env node
// Independent, harness-side verification of a function that generates binary
// output (a QR-code PNG) and stores it. Exercises the whole chain: the function
// deployed (Model-B bundling of a third-party npm dep), invokes, and produces a
// valid PNG — returned in the response and/or written to a storage bucket. A
// real PNG (full 8-byte signature) is the signal, not the agent's word.
//
// Buckets are discovered from the LOCAL admin API (untruncated names — the CLI
// `bucket list` table truncates to 32 chars), matching verify-storage.mjs.
//
// Usage: node verify-generator.mjs <apiUrl> <anonKey> <projectId> <fnName>

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, projectId, fnName] = process.argv.slice(2);
if (!apiUrl || !anonKey || !projectId) {
  console.error('usage: verify-generator.mjs <apiUrl> <anonKey> <projectId> <fnName>');
  process.exit(1);
}
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

// Full 8-byte PNG signature — a 4-byte prefix is trivially spoofable.
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (buf) => buf && buf.length >= 8 && PNG_SIG.every((b, i) => buf[i] === b);

// Depth-first walk: try each entry as a file (download + magic-byte check) and
// as a folder (recurse), so a PNG stored under a nested path (images/2024/x.png)
// is still found. Bounded depth keeps it cheap on the eval's tiny buckets.
async function findPng(v, bucket, prefix, depth) {
  let list;
  try { list = await v.storage.from(bucket).list(prefix); } catch { return false; }
  const files = Array.isArray(list?.data) ? list.data : [];
  for (const f of files) {
    const name = (f?.name || f || '').toString();
    if (!name) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    try {
      const dl = await v.storage.from(bucket).download(path);
      const blob = dl?.data;
      if (blob && typeof blob.arrayBuffer === 'function' && isPng(Buffer.from(await blob.arrayBuffer()))) return true;
    } catch { /* not a file — fall through to recurse */ }
    if (depth > 0 && (await findPng(v, bucket, path, depth - 1))) return true;
  }
  return false;
}

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { user, session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) ({ user, session } = await anon.auth.signUp({ email: `gen-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  const token = session?.access_token;
  if (!token) { emit({ invoked: false, png_in_response: false, png_in_storage: false, error: 'no session' }); process.exit(0); }

  const v = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
  v.database('app');

  let invoke_status = null, invoke_error = null, png_in_response = false;
  if (fnName) {
    const r = await v.functions.invoke(fnName, { url: 'https://volcano.dev/eval-qr' });
    invoke_status = r?.status ?? null;
    invoke_error = r?.error ? String(r.error.message || r.error) : null;
    // Only the base64 PNG signature counts — a caller-supplied `data:image/png`
    // MIME label proves nothing (and a real data URI's base64 starts with it).
    png_in_response = /iVBORw0KGgo/.test(JSON.stringify(r?.data ?? ''));
  }

  // Untruncated bucket names from the local admin API (no auth token — it rejects one).
  let buckets = [];
  try {
    const res = await fetch(`${apiUrl}/projects/${projectId}/storage/buckets`);
    if (res.ok) buckets = (await res.json()).map((b) => b.name).filter(Boolean);
  } catch { /* leave empty */ }

  let png_in_storage = false;
  for (const b of buckets) { if (await findPng(v, b, '', 3)) { png_in_storage = true; break; } }

  emit({ invoked: !!fnName, invoke_status, invoke_error, png_in_response, png_in_storage, buckets_scanned: buckets.length });
} catch (err) {
  emit({ invoked: false, png_in_response: false, png_in_storage: false, error: String(err?.message || err) });
}
process.exit(0);
