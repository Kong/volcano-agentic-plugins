#!/usr/bin/env node
// Best-effort friction-metric parser for a `claude -p --output-format
// stream-json` transcript. Schema is Claude-Code-CLI-specific and can shift
// between versions, so every line is parsed defensively: anything that
// doesn't match the expected shape is counted in `unparsed_lines` rather
// than thrown away silently or crashing the whole run.
//
// Usage: node analyze-transcript.mjs <transcript.jsonl> > metrics.json

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: analyze-transcript.mjs <transcript.jsonl>');
  process.exit(1);
}

const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');

// Known-but-unhandled `type`/block-`type` values are tracked separately from
// unparsed_lines (which is only invalid JSON): a CLI schema change usually
// still produces valid JSON, just with a shape these branches don't expect,
// which would otherwise be silently ignored rather than surfaced anywhere.
const KNOWN_EVENT_TYPES = new Set(['assistant', 'user', 'result', 'system']);
const KNOWN_BLOCK_TYPES = new Set(['text', 'tool_use', 'tool_result']);

const metrics = {
  total_lines: lines.length,
  unparsed_lines: 0,
  unrecognized_event_types: {},
  unrecognized_content_block_types: {},
  tool_calls: 0,
  tool_calls_by_name: {},
  help_invocations: 0,
  help_commands: [],
  failed_tool_calls: 0,
  failed_commands: [],
  file_write_counts: {},
  files_rewritten_more_than_once: [],
  cloud_or_login_attempted: false,
  num_turns: null,
  duration_ms: null,
  total_cost_usd: null,
  session_is_error: null,
};

const HELP_RE = /(^|\s)(--help|-h)(\s|$)/;
const CLOUD_OR_LOGIN_RE = /\bvolcano\s+(cloud|login|signup)\b/;

for (const line of lines) {
  let evt;
  try {
    evt = JSON.parse(line);
  } catch {
    metrics.unparsed_lines++;
    continue;
  }

  if (!KNOWN_EVENT_TYPES.has(evt.type)) {
    const key = String(evt.type);
    metrics.unrecognized_event_types[key] = (metrics.unrecognized_event_types[key] ?? 0) + 1;
  }

  if (evt.type === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block && !KNOWN_BLOCK_TYPES.has(block.type)) {
        const key = String(block.type);
        metrics.unrecognized_content_block_types[key] = (metrics.unrecognized_content_block_types[key] ?? 0) + 1;
      }
      if (block?.type !== 'tool_use') continue;
      metrics.tool_calls++;
      const name = block.name ?? 'unknown';
      metrics.tool_calls_by_name[name] = (metrics.tool_calls_by_name[name] ?? 0) + 1;

      if (name === 'Bash') {
        const cmd = block.input?.command ?? '';
        if (HELP_RE.test(cmd)) {
          metrics.help_invocations++;
          metrics.help_commands.push(cmd);
        }
        if (CLOUD_OR_LOGIN_RE.test(cmd)) {
          metrics.cloud_or_login_attempted = true;
        }
      }

      if (name === 'Write' || name === 'Edit') {
        const filePath = block.input?.file_path ?? block.input?.path;
        if (filePath) {
          metrics.file_write_counts[filePath] = (metrics.file_write_counts[filePath] ?? 0) + 1;
        }
      }
    }
  }

  if (evt.type === 'user' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block && !KNOWN_BLOCK_TYPES.has(block.type)) {
        const key = String(block.type);
        metrics.unrecognized_content_block_types[key] = (metrics.unrecognized_content_block_types[key] ?? 0) + 1;
      }
      if (block?.type !== 'tool_result') continue;
      if (block.is_error === true) {
        metrics.failed_tool_calls++;
        const text = Array.isArray(block.content)
          ? block.content.map((c) => c?.text ?? '').join(' ')
          : String(block.content ?? '');
        metrics.failed_commands.push(text.slice(0, 300));
      }
    }
  }

  if (evt.type === 'result') {
    metrics.num_turns = evt.num_turns ?? metrics.num_turns;
    metrics.duration_ms = evt.duration_ms ?? metrics.duration_ms;
    metrics.total_cost_usd = evt.total_cost_usd ?? metrics.total_cost_usd;
    metrics.session_is_error = evt.is_error ?? metrics.session_is_error;
  }
}

metrics.files_rewritten_more_than_once = Object.entries(metrics.file_write_counts)
  .filter(([, count]) => count > 1)
  .map(([filePath, count]) => ({ file: filePath, writes: count }));

process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
