#!/usr/bin/env node
// Independent, harness-side verification that realtime postgres-changes actually
// deliver for the app's own table. This exercises the full DB->realtime path
// (VOL-521 local-mode enablement/anon-key + VOL-522 SDK per-user channel
// routing): mint a real SDK session, subscribe to INSERT changes on the app's
// main table, insert a row, and confirm the change is delivered to the
// subscriber. The trigger is table-level, so this works whether the built app
// itself uses postgres-changes or broadcast — it proves realtime is enabled and
// the DB->client pipeline works end to end.
//
// Auth uses the shipped local default user (clearwater@volcano.dev), falling
// back to a throwaway signup. Realtime requires an authenticated identity.
//
// Usage: node verify-realtime.mjs <apiUrl> <anonKey> <table> <notNullTextCols csv>

import { VolcanoAuth } from '@volcano.dev/sdk';
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';

const [apiUrl, anonKey, table, colsCsv] = process.argv.slice(2);
if (!apiUrl || !anonKey || !table) {
  console.error('usage: verify-realtime.mjs <apiUrl> <anonKey> <table> <cols>');
  process.exit(1);
}
const cols = (colsCsv || '').split(',').map((c) => c.trim()).filter(Boolean);
const emit = (o) => process.stdout.write(JSON.stringify({ table, ...o }) + '\n');

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) {
    ({ session } = await anon.auth.signUp({ email: `rt-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  }
  const token = session?.access_token;
  if (!token) { emit({ connected: false, delivered: false, error: 'could not obtain a session' }); process.exit(0); }

  const db = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
  db.database('app');
  const rt = new VolcanoRealtime({ apiUrl, anonKey, accessToken: token });

  let got = null;
  try {
    await rt.connect();
    const ch = rt.channel(`public:${table}`, { type: 'postgres' });
    ch.onPostgresChanges('INSERT', 'public', table, (c) => { got = c; });
    await ch.subscribe();
    await new Promise((r) => setTimeout(r, 1500)); // let the listener attach

    const row = {};
    for (const c of cols) row[c] = `eval-realtime-${Date.now()}`;
    const ins = await db.insert(table, row);
    const insertError = ins?.error ? String(ins.error.message || ins.error) : null;

    const t0 = Date.now();
    while (!got && Date.now() - t0 < 9000) await new Promise((r) => setTimeout(r, 200));
    emit({ connected: true, inserted: !insertError, insert_error: insertError, delivered: !!got });
  } finally {
    try { await rt.disconnect(); } catch {}
  }
} catch (err) {
  emit({ connected: false, delivered: false, error: String(err?.message || err) });
}
process.exit(0);
