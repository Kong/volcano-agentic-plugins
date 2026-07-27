#!/usr/bin/env node
// Independent, harness-side check that a project VARIABLE is READ AT RUNTIME.
// The caller (scenario.sh) has already overwritten the variable in the store
// with a fresh CHALLENGE value that appears nowhere in the agent's code, so a
// function that hardcoded the original prefix cannot produce it. We invoke with
// a random name and assert the reply contains the exact adjacent greeting
// `<challengePrefix> <name>` — proof the function read process.env.<VAR> live and
// combined it with the request input. "Set correctly" is checked separately
// against the variables table in scenario.sh.
//
// Usage: node verify-variables.mjs <apiUrl> <anonKey> <fnName> <challengePrefix> <name>

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, fnName, challengePrefix, name] = process.argv.slice(2);
if (!apiUrl || !anonKey) { console.error('usage: verify-variables.mjs <apiUrl> <anonKey> <fnName> <challengePrefix> <name>'); process.exit(1); }
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) ({ session } = await anon.auth.signUp({ email: `vars-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  const token = session?.access_token;
  if (!token) { emit({ invoked: false, consumed: false, error: 'no session' }); process.exit(0); }

  const v = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });

  if (!fnName) { emit({ invoked: false, consumed: false, error: 'no function discovered' }); process.exit(0); }
  const r = await v.functions.invoke(fnName, { name });
  const body = JSON.stringify(r?.data ?? '');
  // Consumed = the exact adjacent greeting `<challengePrefix> <name>` appears.
  // Requiring adjacency (not two independent substrings) rejects the values
  // showing up in unrelated fields; the unguessable challenge prefix rejects a
  // hardcoded prefix.
  const consumed = !!challengePrefix && body.includes(`${challengePrefix} ${name}`);
  emit({
    invoked: true,
    invoke_status: r?.status ?? null,
    invoke_error: r?.error ? String(r.error.message || r.error) : null,
    sent_name: name,
    response: body.slice(0, 300),
    consumed,
  });
} catch (err) {
  emit({ invoked: false, consumed: false, error: String(err?.message || err) });
}
process.exit(0);
