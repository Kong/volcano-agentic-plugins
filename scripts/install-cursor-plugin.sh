#!/usr/bin/env sh
# Install the Volcano plugin into Cursor's local plugins directory.
#
# Cursor has no global AGENTS.md / rules file, so the bootstrap "manual" path
# (which wires a global agent config on other hosts) can only leave a
# project-scoped rule for Cursor. Installing the plugin locally instead gives
# the full, native experience across every Cursor project: the always-applied
# Volcano rule PLUS the volcano-* skills, exactly like a Marketplace install.
#
# Usage:
#   sh scripts/install-cursor-plugin.sh              # from a checkout of this repo
#   curl -fsSL https://raw.githubusercontent.com/Kong/volcano-agentic-plugins/main/scripts/install-cursor-plugin.sh | sh
#
# Env overrides:
#   CURSOR_PLUGINS_DIR     local plugins dir (default ~/.cursor/plugins/local)
#   VOLCANO_PLUGINS_REPO   git URL to clone when not run from a checkout
#   VOLCANO_PLUGINS_REF    git ref to clone (default main)
set -eu

REPO_URL="${VOLCANO_PLUGINS_REPO:-https://github.com/Kong/volcano-agentic-plugins.git}"
REF="${VOLCANO_PLUGINS_REF:-main}"
PLUGINS_DIR="${CURSOR_PLUGINS_DIR:-$HOME/.cursor/plugins/local}"
DEST="$PLUGINS_DIR/volcano"

log() { printf '%s\n' "volcano: $*"; }
warn() { printf '%s\n' "volcano: $*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# Resolve the plugin source: prefer a local checkout (this script living inside
# the repo), otherwise clone from GitHub into a temp dir.
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd 2>/dev/null || true)"
local_cursor="${script_dir:-}/../plugins/cursor"

tmp=""
cleanup() { if [ -n "$tmp" ]; then rm -rf "$tmp"; fi; }
trap cleanup EXIT INT TERM

if [ -n "${script_dir:-}" ] && [ -f "$local_cursor/.cursor-plugin/plugin.json" ]; then
  src="$local_cursor"
  log "installing from local checkout"
else
  have git || { warn "need git to fetch the plugin (or run from a checkout of the repo)"; exit 1; }
  tmp="$(mktemp -d)"
  log "cloning $REPO_URL ($REF)"
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$tmp" >/dev/null 2>&1 \
    || git clone --depth 1 "$REPO_URL" "$tmp" >/dev/null 2>&1 \
    || { warn "clone failed"; exit 1; }
  src="$tmp/plugins/cursor"
fi

[ -f "$src/.cursor-plugin/plugin.json" ] || { warn "could not locate plugins/cursor in the source"; exit 1; }

mkdir -p "$PLUGINS_DIR"
# Replace any prior install (also safely removes a dev symlink at this path).
rm -rf "$DEST"
cp -R "$src" "$DEST"

log "installed the Volcano Cursor plugin to $DEST"
log "restart Cursor (or run \"Developer: Reload Window\") to load it."
