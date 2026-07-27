#!/usr/bin/env node
// Independent, harness-side check that a project VARIABLE is consumed at runtime.
// Invokes the function with a RANDOM name (chosen here, so the agent can't
// hardcode the whole response) and asserts the reply contains both the
// variable-sourced prefix AND that random name — i.e. the function actually read
// process.env.<VAR> and combined it with the request input. "Set correctly" is
// checked separately against the variables table in scenario.sh.
//
// Usage: node verify-variables.mjs <apiUrl> <anonKey> <fnName> <expectedPrefix> <name>

import { VolcanoAuth } from '@volcano.dev/sdk';

const [apiUrl, anonKey, fnName, expectedPrefix, name] = process.argv.slice(2);
if (!apiUrl || !anonKey) { console.error('usage: verify-variables.mjs <apiUrl> <anonKey> <fnName> <expectedPrefix> <name>'); process.exit(1); }
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

try {
  const anon = new VolcanoAuth({ apiUrl, anonKey });
  let { session } = await anon.auth.signIn({ email: 'clearwater@volcano.dev', password: 'tomahawk' });
  if (!session?.access_token) ({ session } = await anon.auth.signUp({ email: `vars-eval-${Date.now()}@example.com`, password: 'Eval-Test-Password-1!', signInWhenAllowed: true }));
  const token = session?.access_token;
  if (!token) { emit({ invoked: false, consumed: false, error: 'no session' }); process.exit(0); }

  const v = new VolcanoAuth({ apiUrl, anonKey, accessToken: token });
  v.database('app');

  if (!fnName) { emit({ invoked: false, consumed: false, error: 'no function discovered' }); process.exit(0); }
  const r = await v.functions.invoke(fnName, { name });
  const body = JSON.stringify(r?.data ?? '');
  // Consumed = both the variable-sourced prefix and the random input appear in
  // the reply. A function that forgot `volcano variables deploy` returns an
  // undefined/missing prefix and fails this.
  const consumed = !!expectedPrefix && body.includes(expectedPrefix) && body.includes(name);
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
