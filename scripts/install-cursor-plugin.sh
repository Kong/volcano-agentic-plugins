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
#   VOLCANO_PLUGINS_REF    git branch or tag to clone (default main)
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
install_tmp=""
old_dest=""
cleanup() {
  if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
  if [ -n "$install_tmp" ]; then rm -rf "$install_tmp"; fi
  if [ -n "$old_dest" ] && { [ -e "$old_dest" ] || [ -L "$old_dest" ]; }; then rm -rf "$old_dest"; fi
}
trap cleanup 0 INT TERM

if [ -n "${script_dir:-}" ] && [ -f "$local_cursor/.cursor-plugin/plugin.json" ]; then
  src="$local_cursor"
  log "installing from local checkout"
else
  have git || { warn "need git to fetch the plugin (or run from a checkout of the repo)"; exit 1; }
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/volcano-cursor.XXXXXX")"
  repo="$tmp/repo"
  log "cloning $REPO_URL ($REF)"
  # Try the requested branch/tag first (quietly), then fall back to the default
  # branch keeping stderr so auth/network errors surface if that fails too.
  if ! git clone --depth 1 --branch "$REF" "$REPO_URL" "$repo" >/dev/null 2>&1; then
    warn "could not clone ref '$REF' as a branch or tag; falling back to the repository default branch"
    rm -rf "$repo"
    git clone --depth 1 "$REPO_URL" "$repo" >/dev/null \
    || { warn "clone failed"; exit 1; }
  fi
  src="$repo/plugins/cursor"
fi

[ -f "$src/.cursor-plugin/plugin.json" ] || { warn "could not locate plugins/cursor in the source"; exit 1; }

if [ -z "${CURSOR_PLUGINS_DIR:-}" ] && [ ! -d "$HOME/.cursor" ]; then
  warn "$HOME/.cursor does not exist; creating Cursor's local plugin directory anyway"
fi
mkdir -p "$PLUGINS_DIR"
# Safety guard before rm -rf: only ever operate on a path that ends in /volcano,
# and never the filesystem root form "/volcano".
case "$DEST" in
  */volcano) ;;
  *) warn "refusing to remove unexpected destination: $DEST"; exit 1 ;;
esac
[ "$DEST" = "/volcano" ] && { warn "refusing to remove $DEST"; exit 1; }
# Copy to a sibling temp dir before replacing any prior install. This keeps a
# failed copy from leaving the final plugin path half-populated.
install_tmp="$(mktemp -d "$PLUGINS_DIR/.volcano-install.XXXXXX")"
cp -R "$src" "$install_tmp/volcano"
old_dest="$PLUGINS_DIR/.volcano-previous.$$"
while [ -e "$old_dest" ] || [ -L "$old_dest" ]; do
  old_dest="$old_dest.$$"
done
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  mv "$DEST" "$old_dest"
else
  old_dest=""
fi
if ! mv "$install_tmp/volcano" "$DEST"; then
  if [ -n "$old_dest" ] && { [ -e "$old_dest" ] || [ -L "$old_dest" ]; }; then
    if mv "$old_dest" "$DEST"; then
      old_dest=""
    fi
  fi
  warn "failed to install plugin at $DEST"
  exit 1
fi
if [ -n "$old_dest" ]; then
  rm -rf "$old_dest"
  old_dest=""
fi

log "installed the Volcano Cursor plugin to $DEST"
log "restart Cursor (or run \"Developer: Reload Window\") to load it."
