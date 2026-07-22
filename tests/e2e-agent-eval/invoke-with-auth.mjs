#!/usr/bin/env node
// Independent, harness-side verification of deployed functions using a real
// authenticated session — not the agent's own claim of success.
//
// Why this exists: `volcano functions invoke` (the CLI) has no flag to supply
// a bearer token (tracked separately as a CLI feature gap, not fixed here),
// but a correctly-built function requires `__volcano_auth` and 401s without
// one. Testing only unauthenticated invokes would make a properly-secured
// function look like a failure and an insecure one look like a pass — the
// opposite of what we want to measure. This mints a throwaway local test
// user via the SDK (the same one a real client app would use) and invokes
// through `volcano.functions.invoke(...)`, matching the documented
// client-facing pattern in volcano_functions/volcano_sdk.
//
// Usage: node invoke-with-auth.mjs <apiUrl> <anonKey> <fn1> [fn2] ...

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, ...names] = process.argv.slice(2);
if (!apiUrl || !anonKey) {
  console.error('usage: invoke-with-auth.mjs <apiUrl> <anonKey> <fn...>');
  process.exit(1);
}

const email = `e2e-eval-${Date.now()}@example.com`;
const password = 'Eval-Test-Password-1!';

async function getAccessToken() {
  const volcano = new VolcanoAuth({ apiUrl, anonKey });
  // signInWhenAllowed: local dev has no email confirmation step, so this
  // returns a live session directly; falls back to an explicit signIn for
  // environments where it doesn't (matching SignUpOptions' documented
  // default: signup alone is session-less unless this is set).
  const signUp = await volcano.auth.signUp({ email, password, signInWhenAllowed: true });
  if (signUp.session?.access_token) return signUp.session.access_token;

  const signIn = await volcano.auth.signIn({ email, password });
  if (signIn.session?.access_token) return signIn.session.access_token;

  throw new Error(
    'no session from signUp or signIn: ' +
      JSON.stringify({ signUpError: signUp.error, signInError: signIn.error })
  );
}

let token;
try {
  token = await getAccessToken();
} catch (err) {
  process.stdout.write(JSON.stringify({ auth_error: String(err), invocations: [] }, null, 2) + '\n');
  process.exit(0);
}

const authed = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
const invocations = [];
for (const name of names) {
  try {
    const { data, status, error } = await authed.functions.invoke(name, {});
    invocations.push({ name, status, data, error: error ? String(error) : null });
  } catch (err) {
    invocations.push({ name, status: null, data: null, error: String(err) });
  }
}

process.stdout.write(JSON.stringify({ auth_error: null, invocations }, null, 2) + '\n');
