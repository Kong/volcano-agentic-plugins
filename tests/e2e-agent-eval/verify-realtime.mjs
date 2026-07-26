#!/usr/bin/env node
// Independent, harness-side verification that realtime postgres-changes actually
// deliver for the app's own tables. Exercises the full DB->realtime path (VOL-521
// local-mode enablement/anon-key + VOL-522 SDK per-user channel routing).
//
// For each candidate table (all public base tables that have a text column), it
// mints a real SDK session, subscribes to INSERT changes, inserts a row, and
// checks THAT row's change is delivered. Passes on the first table that
// delivers. The trigger is table-level, so this proves realtime is enabled and
// the DB->client pipeline works regardless of which table the app writes.
//
// Robustness (addressing PR review):
//   - Fills EVERY required (NOT NULL, no-default) column with a type-appropriate
//     value (text/uuid/int/bool/timestamp/json), not just text, so a schema like
//     `room_id uuid NOT NULL` doesn't cause a false insert failure.
//   - Matches delivery on the inserted row's own id (or a unique nonce), so an
//     unrelated/concurrent INSERT can't mark the check delivered.
//   - Tries all candidate tables, so a scaffold example table with an
//     unsatisfiable FK doesn't produce a false failure when the app's real table
//     works.
//
// Usage: node verify-realtime.mjs <apiUrl> <anonKey> "<table|col:type,...>;;<table2|...>"

import { VolcanoAuth } from '@volcano.dev/sdk';
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';
import { randomUUID } from 'node:crypto';

const [apiUrl, anonKey, candidatesArg] = process.argv.slice(2);
if (!apiUrl || !anonKey || !candidatesArg) {
  console.error('usage: verify-realtime.mjs <apiUrl> <anonKey> "<table|col:type,...>;;..."');
  process.exit(1);
}
const nonce = `eval-rt-${randomUUID()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

function valueForType(type) {
  const t = (type || '').toLowerCase();
  if (t === 'uuid') return randomUUID();
  if (t === 'boolean') return true;
  if (t.includes('int') || t === 'numeric' || t.includes('double') || t.includes('real') || t.includes('decimal')) return 1;
  if (t.includes('timestamp') || t === 'date') return new Date().toISOString();
  if (t === 'json' || t === 'jsonb') return {};
  return nonce; // text/varchar and best-effort fallback carry the unique marker
}
const candidates = candidatesArg.split(';;').map((s) => s.trim()).filter(Boolean).map((spec) => {
  const i = spec.indexOf('|');
  const table = spec.slice(0, i);
  const cols = spec.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const j = s.lastIndexOf(':');
    return { col: s.slice(0, j), type: s.slice(j + 1) };
  });
  return { table, cols };
});

async function getToken() {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let r = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (r?.session?.access_token) return r.session.access_token;
  r = await anon.auth.signUp({ email: `rt-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true });
  return r?.session?.access_token || null;
}

try {
  const token = await getToken();
  if (!token) { emit({ connected: false, delivered: false, error: 'could not obtain a session' }); process.exit(0); }
  const db = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
  db.database('app');
  const rt = new VolcanoRealtime({ apiUrl, anonKey, accessToken: token });

  const results = [];
  let delivered = false;
  let deliveredTable = null;
  try {
    await rt.connect();
    for (const { table, cols } of candidates) {
      const events = [];
      const ch = rt.channel(`public:${table}`, { type: 'postgres' });
      ch.onPostgresChanges('INSERT', 'public', table, (c) => events.push(c));
      await ch.subscribe();
      await sleep(1200); // let the listener attach

      const row = {};
      for (const { col, type } of cols) row[col] = valueForType(type);
      const ins = await db.insert(table, row);
      const insertError = ins?.error ? String(ins.error.message || ins.error) : null;
      const insRow = Array.isArray(ins?.data) ? ins.data[0] : ins?.data;
      const insertedId = insRow?.id ?? null;
      const matches = (c) => {
        const rec = c?.record || c || {};
        if (insertedId && rec.id === insertedId) return true;
        try { return JSON.stringify(c).includes(nonce); } catch { return false; }
      };

      const t0 = Date.now();
      while (!events.some(matches) && Date.now() - t0 < 7000) await sleep(200);
      const d = events.some(matches);
      results.push({ table, inserted: !insertError, insert_error: insertError, delivered: d });
      try { ch.unsubscribe(); } catch {}
      if (d) { delivered = true; deliveredTable = table; break; }
    }
    emit({ connected: true, delivered, delivered_table: deliveredTable, candidates: results });
  } finally {
    try { await rt.disconnect(); } catch {}
  }
} catch (err) {
  emit({ connected: false, delivered: false, error: String(err?.message || err) });
}
process.exit(0);
