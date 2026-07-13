/**
 * Minimal model-call abstraction for the agent-behavior eval harness.
 *
 * Kept as a single small function so the runner can be unit-tested by
 * injecting a fake provider (see eval-agent-guidance-selftest.mjs) without
 * any network access or API key.
 */

const DEFAULT_MODEL = process.env.AGENT_EVAL_MODEL || "gpt-4o-mini";

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * @param {{system: string, user: string}} messages
 * @returns {Promise<string>} the assistant's response text
 */
export async function callOpenAI({ system, user }, { model = DEFAULT_MODEL, apiKey } = {}) {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set; cannot make a live model call");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`Unexpected OpenAI response shape: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return text;
}

/** True when a live provider call is configured (used to gate CI steps). */
export function hasLiveProviderConfigured(env = process.env) {
  return Boolean(env.OPENAI_API_KEY);
}
