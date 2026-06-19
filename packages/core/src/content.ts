/**
 * Runtime content fetcher. Agent content (AGENTS.md, skills) is ALWAYS fetched
 * from the configured origin at runtime and never bundled into a plugin
 * artifact, so it can never go stale behind marketplace review latency.
 */

import { resolveWebUrl } from "./config";

export interface FetchOptions {
  /** AbortSignal for cancellation/timeout. */
  signal?: AbortSignal;
}

export interface SkillEntry {
  name: string;
  description?: string;
}

export interface SkillsIndex {
  skills: SkillEntry[];
}

function joinUrl(webUrl: string, path: string): string {
  const base = webUrl.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}

/** Fetch a text resource relative to the web URL. Throws on non-2xx. */
export async function fetchText(
  pathOrUrl: string,
  webUrlOverride?: string,
  opts: FetchOptions = {},
): Promise<string> {
  const url = /^https?:\/\//.test(pathOrUrl)
    ? pathOrUrl
    : joinUrl(resolveWebUrl(webUrlOverride), pathOrUrl);

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.text();
}

/** Fetch the canonical agent instructions (AGENTS.md). */
export function fetchAgentsMd(
  webUrlOverride?: string,
  opts: FetchOptions = {},
): Promise<string> {
  return fetchText("/AGENTS.md", webUrlOverride, opts);
}

/** Fetch and parse the skills manifest. */
export async function fetchSkillsIndex(
  webUrlOverride?: string,
  opts: FetchOptions = {},
): Promise<SkillsIndex> {
  const raw = await fetchText("/skills/index.json", webUrlOverride, opts);
  const parsed = JSON.parse(raw) as Partial<SkillsIndex> & {
    skills?: unknown;
  };
  const skills = Array.isArray(parsed.skills)
    ? (parsed.skills as SkillEntry[])
    : [];
  return { skills };
}

/** Fetch a single skill's SKILL.md by name. */
export function fetchSkill(
  name: string,
  webUrlOverride?: string,
  opts: FetchOptions = {},
): Promise<string> {
  return fetchText(`/skills/${name}/SKILL.md`, webUrlOverride, opts);
}
