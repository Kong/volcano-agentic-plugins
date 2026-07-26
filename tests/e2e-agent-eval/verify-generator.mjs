#!/usr/bin/env node
// Independent, harness-side verification of a function that generates binary
// output (a QR-code PNG) and stores it. Exercises the whole chain: the function
// deployed (Model-B bundling of a third-party npm dep), invokes, and produces a
// valid PNG — returned in the response and/or written to a storage bucket. A
// real PNG (magic bytes / base64 header) is the signal, not the agent's word.
//
// Usage: node verify-generator.mjs <apiUrl> <anonKey> <fnName> <bucketsCsv>

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, fnName, bucketsCsv] = process.argv.slice(2);
if (!apiUrl || !anonKey) { console.error('usage: verify-generator.mjs <apiUrl> <anonKey> <fnName> <buckets>'); process.exit(1); }
const buckets = (bucketsCsv || '').split(',').map((b) => b.trim()).filter(Boolean);
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const isPng = (buf) => buf && buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

async function anyPngInBucket(v, bucket, prefixes) {
  for (const prefix of prefixes) {
    let list;
    try { list = await v.storage.from(bucket).list(prefix); } catch { continue; }
    const files = Array.isArray(list?.data) ? list.data : [];
    for (const f of files) {
      const name = (f?.name || f || '').toString();
      if (!name) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      try {
        const dl = await v.storage.from(bucket).download(path);
        const blob = dl?.data;
        if (blob && typeof blob.arrayBuffer === 'function') {
          if (isPng(Buffer.from(await blob.arrayBuffer()))) return true;
        }
      } catch { /* folder or unreadable — skip */ }
    }
  }
  return false;
}

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { user, session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) ({ user, session } = await anon.auth.signUp({ email: `gen-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  const token = session?.access_token;
  if (!token) { emit({ png_in_response: false, png_in_storage: false, error: 'no session' }); process.exit(0); }

  const v = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
  v.database('app');

  let invoke_status = null, invoke_error = null, png_in_response = false;
  if (fnName) {
    const r = await v.functions.invoke(fnName, { url: 'https://volcano.dev/eval-qr' });
    invoke_status = r?.status ?? null;
    invoke_error = r?.error ? String(r.error.message || r.error) : null;
    png_in_response = /iVBORw0KGgo|data:image\/png/i.test(JSON.stringify(r?.data ?? ''));
  }

  const prefixes = ['', user?.id || '', 'qr', 'qrcodes', 'codes'];
  let png_in_storage = false;
  for (const b of buckets) { if (await anyPngInBucket(v, b, prefixes)) { png_in_storage = true; break; } }

  emit({ invoked: !!fnName, invoke_status, invoke_error, png_in_response, png_in_storage });
} catch (err) {
  emit({ png_in_response: false, png_in_storage: false, error: String(err?.message || err) });
}
process.exit(0);
