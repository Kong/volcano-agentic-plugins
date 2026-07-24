#!/usr/bin/env node
// Independent, harness-side verification of deployed functions using a real
// authenticated session — not the agent's own claim of success.
//
// Why this exists: `volcano functions invoke` (the CLI) has no flag to supply
// a bearer token, but a correctly-built function requires `__volcano_auth`.
// This mints a throwaway local user via the SDK and invokes through
// `volcano.functions.invoke(...)`, the documented client-facing path.
//
// It does a CREATE -> LIST ROUND-TRIP, not just "any 2xx": earlier a broken
// create (e.g. `volcano.insert(...).select()` -> HTTP 500) was masked because
// a trivially-working list returned an empty 2xx array and counted as pass.
// Now we fire a unique-titled probe at every function (the real create
// persists a todo as the authed user), then list, and only report
// round_trip_ok if that exact probe comes back — so a broken create fails.
//
// Usage: node invoke-with-auth.mjs <apiUrl> <anonKey> <fn1> [fn2] ...
// Output JSON: { auth_error, probe, round_trip_ok, any_2xx, any_5xx, invocations[] }

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, ...names] = process.argv.slice(2);
if (!apiUrl || !anonKey) {
  console.error('usage: invoke-with-auth.mjs <apiUrl> <anonKey> <fn...>');
  process.exit(1);
}

const email = `e2e-eval-${Date.now()}@example.com`;
const password = 'Eval-Test-Password-1!';
const probe = `eval-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function getAccessToken() {
  const volcano = new VolcanoAuth({ apiUrl, anonKey });
  const signUp = await volcano.auth.signUp({ email, password, signInWhenAllowed: true });
  if (signUp.session?.access_token) return signUp.session.access_token;
  const signIn = await volcano.auth.signIn({ email, password });
  if (signIn.session?.access_token) return signIn.session.access_token;
  throw new Error('no session: ' + JSON.stringify({ signUpError: signUp.error, signInError: signIn.error }));
}

const is2xx = (s) => typeof s === 'number' && s >= 200 && s < 300;
const bodyStr = (d) => {
  if (d == null) return '';
  if (typeof d === 'string') return d;
  try { return JSON.stringify(d); } catch { return ''; }
};

let token;
try {
  token = await getAccessToken();
} catch (err) {
  process.stdout.write(JSON.stringify({ auth_error: String(err), probe, round_trip_ok: false, any_2xx: false, any_5xx: false, invocations: [] }, null, 2) + '\n');
  process.exit(0);
}

const authed = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
const invocations = [];
async function invoke(name, payload, phase) {
  try {
    const { data, status, error } = await authed.functions.invoke(name, payload);
    invocations.push({ name, phase, status, data, error: error ? String(error) : null });
  } catch (err) {
    invocations.push({ name, phase, status: null, data: null, error: String(err) });
  }
}

// Phase 1 — fire a unique-titled create probe at every function (the real
// create inserts a todo with this title as the authed user; others ignore/4xx).
for (const name of names) await invoke(name, { title: probe, description: probe, completed: false }, 'create');
// Phase 2 — list with an empty payload; the real list returns the caller's todos.
for (const name of names) await invoke(name, {}, 'list');

const any_2xx = invocations.some((i) => !i.error && is2xx(i.status));
const any_5xx = invocations.some((i) => typeof i.status === 'number' && i.status >= 500);
// Round-trip: after our create-probes, does a list return the exact probe title?
const round_trip_ok = invocations.some(
  (i) => i.phase === 'list' && is2xx(i.status) && bodyStr(i.data).includes(probe)
);

process.stdout.write(JSON.stringify({ auth_error: null, probe, round_trip_ok, any_2xx, any_5xx, invocations }, null, 2) + '\n');
