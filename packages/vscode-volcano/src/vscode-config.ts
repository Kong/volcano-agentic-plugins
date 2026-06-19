import * as vscode from "vscode";
import { resolveWebUrl, resolveApiUrl, isDevWebUrl } from "@volcano-plugins/core";

export interface ResolvedConfig {
  webUrl: string;
  apiUrl?: string;
  cliPath: string;
  isDev: boolean;
}

/**
 * Read the `volcano.*` settings and resolve effective endpoints. The IDE
 * setting is the override; core handles env fallback and the prod default. No
 * origin is hardcoded here in a non-overridable way.
 */
export function getConfig(): ResolvedConfig {
  const cfg = vscode.workspace.getConfiguration("volcano");
  const webUrl = resolveWebUrl(cfg.get<string>("webUrl"));
  const apiUrl = resolveApiUrl(cfg.get<string>("apiUrl"));
  const cliPath = (cfg.get<string>("cliPath") || "volcano").trim() || "volcano";
  return { webUrl, apiUrl, cliPath, isDev: isDevWebUrl(webUrl) };
}

/** Env overrides to pass when invoking the CLI / bootstrap. */
export function cliEnv(cfg: ResolvedConfig): Record<string, string> {
  const env: Record<string, string> = { VOLCANO_WEB_URL: cfg.webUrl };
  if (cfg.apiUrl) env.VOLCANO_API_URL = cfg.apiUrl;
  return env;
}
