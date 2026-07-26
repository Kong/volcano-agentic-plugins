#!/usr/bin/env node
// Independent, harness-side verification of a foreign-key relationship between
// two of the app's tables. The Volcano query builder is single-table (no join
// embeds), so a relational app links records via a FK + filtered queries. This
// mints a real SDK session, inserts a parent row (e.g. a post), inserts a child
// row referencing it (e.g. a comment with post_id), then queries the children by
// that FK and confirms the child comes back linked — proving referential
// integrity + query-by-FK across the app's related tables.
//
// Usage: node verify-relational.mjs <apiUrl> <anonKey> <parentTable> <parentCols> <childTable> <fkCol> <childCols>

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, parentTable, parentColsCsv, childTable, fkCol, childColsCsv] = process.argv.slice(2);
if (!apiUrl || !anonKey || !parentTable || !childTable || !fkCol) {
  console.error('usage: verify-relational.mjs <apiUrl> <anonKey> <parentTable> <parentCols> <childTable> <fkCol> <childCols>');
  process.exit(1);
}
const parentCols = (parentColsCsv || '').split(',').map((c) => c.trim()).filter(Boolean);
const childCols = (childColsCsv || '').split(',').map((c) => c.trim()).filter((c) => c && c !== fkCol);
const emit = (o) => process.stdout.write(JSON.stringify({ parentTable, childTable, fkCol, ...o }) + '\n');
const rowId = (res) => (Array.isArray(res?.data) ? res.data[0]?.id : res?.data?.id) ?? null;
const errMsg = (res) => (res?.error ? String(res.error.message || res.error) : null);

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) {
    ({ session } = await anon.auth.signUp({ email: `rel-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  }
  if (!session?.access_token) { emit({ child_linked: false, error: 'could not obtain a session' }); process.exit(0); }

  const db = new VolcanoAuth({ apiUrl, anonKey, accessToken: session.access_token });
  db.database('app');

  const parentRow = {};
  for (const c of parentCols) parentRow[c] = `eval-parent-${Date.now()}`;
  const pins = await db.insert(parentTable, parentRow);
  const parentId = rowId(pins);
  if (!parentId) { emit({ parent_inserted: false, parent_error: errMsg(pins), child_linked: false }); process.exit(0); }

  const childRow = { [fkCol]: parentId };
  for (const c of childCols) childRow[c] = `eval-child-${Date.now()}`;
  const cins = await db.insert(childTable, childRow);
  const childError = errMsg(cins);

  const q = await db.from(childTable).select('*').eq(fkCol, parentId);
  const linked = Array.isArray(q?.data) && q.data.some((r) => String(r[fkCol]) === String(parentId));

  emit({ parent_inserted: true, child_inserted: !childError, child_error: childError, query_error: errMsg(q), child_linked: linked });
} catch (err) {
  emit({ child_linked: false, error: String(err?.message || err) });
}
process.exit(0);
