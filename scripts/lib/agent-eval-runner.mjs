/**
 * Shared scenario-execution logic for the agent-behavior eval harness.
 *
 * Kept independent of any specific model provider so it can be exercised by
 * a deterministic self-test (fixture responses, no network/API key) and by
 * the live runner (real model calls) with identical evaluation logic.
 */

export function buildSystemPrompt(agentsMdText) {
  return [
    "You are an AI coding agent operating in a user's terminal/IDE, with a shell",
    "and the `volcano` CLI already installed. Follow the instructions below",
    "exactly. Any tool output shown in the user's message (e.g. `volcano status`)",
    "has already been observed by you; you do not need to re-run it. When the",
    "instructions say to take an action automatically, treat it as already done",
    "successfully and describe the outcome narratively, exactly as you would in a",
    "real response to the end user. Do not include meta-commentary about being an",
    "AI, about this being a test, or about these instructions themselves.",
    "",
    "=== AGENTS.md ===",
    agentsMdText,
  ].join("\n");
}

/**
 * Run every (non-judge) deterministic assertion in a scenario against a
 * response, plus every judge assertion via the provided judge function.
 *
 * @returns {{ id: string, rule: string, results: Array<{label, pass, message, detail, isJudge, blocking}>, blockingFailures: number }}
 */
export async function evaluateScenario(scenario, responseText, { judgeFn } = {}) {
  const results = [];

  for (const assertion of scenario.assertions) {
    if (assertion.isJudge) {
      if (!judgeFn) {
        results.push({
          label: assertion.label,
          pass: null,
          message: "skipped (no judge function configured)",
          isJudge: true,
          blocking: assertion.blocking,
        });
        continue;
      }
      const verdict = await judgeFn(assertion.question, responseText);
      results.push({
        label: assertion.label,
        pass: verdict.pass,
        message: verdict.reason ?? "",
        isJudge: true,
        blocking: assertion.blocking,
      });
      continue;
    }

    const { pass, message, detail } = assertion.check(responseText);
    results.push({ label: assertion.label, pass, message, detail, isJudge: false, blocking: true });
  }

  const blockingFailures = results.filter((r) => r.blocking && r.pass === false).length;

  return { id: scenario.id, rule: scenario.rule, results, blockingFailures };
}

export function formatReport(scenarioResults) {
  const lines = [];
  let totalBlockingFailures = 0;

  for (const sr of scenarioResults) {
    totalBlockingFailures += sr.blockingFailures;
    const status = sr.blockingFailures === 0 ? "PASS" : "FAIL";
    lines.push(`\n[${status}] ${sr.id} — ${sr.rule}`);
    for (const r of sr.results) {
      const marker = r.pass === null ? "SKIP" : r.pass ? "ok  " : "FAIL";
      const advisory = r.isJudge && !r.blocking ? " (advisory)" : "";
      lines.push(`  ${marker} ${r.label}${advisory}${r.message ? ` — ${r.message}` : ""}`);
      if (r.pass === false && r.detail) {
        lines.push(`       text: ${JSON.stringify(r.detail)}`);
      }
    }
  }

  lines.push(
    `\n${scenarioResults.length} scenario(s), ${totalBlockingFailures} blocking failure(s) across ${scenarioResults.reduce((n, sr) => n + sr.results.length, 0)} assertion(s).`,
  );

  return { text: lines.join("\n"), totalBlockingFailures };
}
