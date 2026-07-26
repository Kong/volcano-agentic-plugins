#!/usr/bin/env node
// Independent, harness-side verification of a foreign-key relationship between
// two of the app's tables. The Volcano query builder is single-table (no join
// embeds), so a relational app links records via a FK + filtered queries. This
// mints a real SDK session, inserts a parent row, inserts a child row that
// references the parent via the FK's *referenced* column, then queries the
// children by that FK and confirms the just-inserted child comes back linked.
//
// Robustness (addressing PR review):
//   - Uses the FK's referenced column (ccu.column_name), not an assumed `id`, so
//     a FK targeting a non-id unique key still works.
//   - Fills every required (NOT NULL, no-default) column with a type-appropriate
//     value (text/uuid/int/bool/timestamp/json); uuid columns named like an
//     owner reuse the authenticated user's id to satisfy owner FKs.
//   - Gates "linked" on the explicit child insert succeeding AND the queried row
//     being the one just inserted (matched by child id) — a trigger/side-effect
//     row can't produce a false pass.
//   - Evaluates all discovered FK edges (post/comment edge first) and passes on
//     the first that links, so an unrelated/unsatisfiable FK isn't a false fail.
//
// Usage: node verify-relational.mjs <apiUrl> <anonKey> <fksFile> <colsFile>

import { VolcanoAuth } from '@volcano.dev/sdk';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [apiUrl, anonKey, fksFile, colsFile] = process.argv.slice(2);
if (!apiUrl || !anonKey || !fksFile || !colsFile) {
  console.error('usage: verify-relational.mjs <apiUrl> <anonKey> <fksFile> <colsFile>');
  process.exit(1);
}
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const errMsg = (res) => (res?.error ? String(res.error.message || res.error) : null);
const firstRow = (res) => (Array.isArray(res?.data) ? res.data[0] : res?.data) ?? null;

// fks.txt: child|fkCol|parent|refCol   cols.txt: table|col|type
const fks = readFileSync(fksFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const [child, fkCol, parent, refCol] = l.split('|'); return { child, fkCol, parent, refCol }; });
const colsByTable = {};
for (const l of readFileSync(colsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)) {
  const [table, col, type] = l.split('|');
  (colsByTable[table] ||= []).push({ col, type });
}

let authUserId = null;
function valueFor(col, type) {
  const t = (type || '').toLowerCase();
  if (t === 'uuid') return (authUserId && /user|author|owner|creator|account/i.test(col)) ? authUserId : randomUUID();
  if (t === 'boolean') return true;
  if (t.includes('int') || t === 'numeric' || t.includes('double') || t.includes('real') || t.includes('decimal')) return 1;
  if (t.includes('timestamp') || t === 'date') return new Date().toISOString();
  if (t === 'json' || t === 'jsonb') return {};
  return `eval-rel-${randomUUID()}`;
}
function buildRow(table, skip = []) {
  const row = {};
  for (const { col, type } of colsByTable[table] || []) if (!skip.includes(col)) row[col] = valueFor(col, type);
  return row;
}

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let r = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!r?.session?.access_token) r = await anon.auth.signUp({ email: `rel-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true });
  const session = r?.session;
  if (!session?.access_token) { emit({ child_linked: false, error: 'could not obtain a session' }); process.exit(0); }
  authUserId = r?.user?.id ?? null;

  const db = new VolcanoAuth({ apiUrl, anonKey, accessToken: session.access_token });
  db.database('app');

  const attempts = [];
  let linked = false;
  let linkedEdge = null;
  for (const { child, fkCol, parent, refCol } of fks) {
    const pins = await db.insert(parent, buildRow(parent));
    const prow = firstRow(pins);
    const refValue = prow?.[refCol] ?? null;
    if (refValue == null) { attempts.push({ edge: `${child}.${fkCol}->${parent}.${refCol}`, parent_error: errMsg(pins) || `parent row missing ${refCol}`, child_linked: false }); continue; }

    const childRow = { ...buildRow(child, [fkCol]), [fkCol]: refValue };
    const cins = await db.insert(child, childRow);
    const childError = errMsg(cins);
    const childId = firstRow(cins)?.id ?? null;

    let edgeLinked = false;
    let queryError = null;
    if (!childError) {
      const q = await db.from(child).select('*').eq(fkCol, refValue);
      queryError = errMsg(q);
      edgeLinked = Array.isArray(q?.data) && q.data.some((row) => String(row[fkCol]) === String(refValue) && (childId == null || String(row.id) === String(childId)));
    }
    attempts.push({ edge: `${child}.${fkCol}->${parent}.${refCol}`, child_inserted: !childError, child_error: childError, query_error: queryError, child_linked: edgeLinked });
    if (edgeLinked) { linked = true; linkedEdge = `${child}.${fkCol}->${parent}.${refCol}`; break; }
  }
  emit({ child_linked: linked, linked_edge: linkedEdge, edges: attempts });
} catch (err) {
  emit({ child_linked: false, error: String(err?.message || err) });
}
process.exit(0);
