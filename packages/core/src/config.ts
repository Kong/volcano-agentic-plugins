/**
 * Base-URL resolution for Volcano plugins.
 *
 * Precedence: explicit override (e.g. an IDE setting) > environment variable >
 * production default. Mirrors the origin-derived behavior of bootstrap.sh so a
 * localhost web URL drives dev and the prod default drives production. No origin
 * is ever hardcoded in a non-overridable way.
 */

export const DEFAULT_WEB_URL = "https://volcano.dev";

/** Trailing-slash-stripped string, or undefined for empty input. */
function clean(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

export interface VolcanoEndpoints {
  /** Where docs/skills/AGENTS.md are fetched from. */
  webUrl: string;
  /** Non-prod API URL the CLI should target; undefined => CLI's compiled default. */
  apiUrl?: string;
}

/**
 * Resolve the web URL. Override (IDE setting) wins, then VOLCANO_WEB_URL, then
 * the production default.
 */
export function resolveWebUrl(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return clean(override) ?? clean(env.VOLCANO_WEB_URL) ?? DEFAULT_WEB_URL;
}

/**
 * Resolve the API URL. Override wins, then VOLCANO_API_URL. Undefined means the
 * CLI uses its compiled-in production default (we only inject for non-prod).
 */
export function resolveApiUrl(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return clean(override) ?? clean(env.VOLCANO_API_URL);
}

export function resolveEndpoints(
  overrides: { webUrl?: string; apiUrl?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): VolcanoEndpoints {
  return {
    webUrl: resolveWebUrl(overrides.webUrl, env),
    apiUrl: resolveApiUrl(overrides.apiUrl, env),
  };
}

/** True when the web URL points at a local dev origin. */
export function isDevWebUrl(webUrl: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(webUrl);
}
