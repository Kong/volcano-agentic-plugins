#!/usr/bin/env sh
# Volcano agent bootstrap — the manual/no-plugin install path.
#
# Wires Volcano into your coding agent's *existing, global* setup — additively, never
# overwriting — and installs the Volcano CLI. This is the alternative to installing
# the Volcano plugin for your IDE: same end state (CLI + AGENTS.md + skills + agent
# wiring), achieved without a plugin marketplace.
#
# Plugin-first: if an agent already has the Volcano plugin installed, the plugin is
# the source of truth (its skills carry the guidance, loaded on demand), so this
# script does NOT wire a ~/.volcano/AGENTS.md fallback for that agent and removes any
# managed block a prior no-plugin run left behind — avoiding a second, independently
# stale always-on copy. The CLI install/upgrade still runs regardless.
#
#   curl -fsSL https://raw.githubusercontent.com/Kong/volcano-agentic-plugins/main/scripts/bootstrap.sh | sh
#
# Runs immediately — there is no plan/dry-run mode. Review this script before
# piping it into `sh` if you want to inspect it first; it is plain, idempotent
# shell with no obfuscation.
#
# Supported agents: claude | codex | cursor
# Omit --agent to auto-detect every agent whose config dir already exists.
#
# Cursor has no scriptable global rules surface, so this script never writes
# Cursor config on your behalf — it prints the exact rule content and tells you
# where to paste it (project .cursor/rules/volcano.mdc, and/or Settings → Rules →
# User Rules).
#
# Env overrides:
#   VOLCANO_WEB_URL      where AGENTS.md/skills are fetched from (default https://volcano.dev)
#   VOLCANO_HOME         canonical install dir (default ~/.volcano)
#   VOLCANO_INSTALL_DIR  override CLI install dir (GitHub-release fallback only)
#   VOLCANO_CLI_NPM_PACKAGE  override the npm package spec (default @volcano.dev/cli@latest)
set -eu

WEB_URL="${VOLCANO_WEB_URL:-https://volcano.dev}"
WEB_URL="${WEB_URL%/}"
VOLCANO_HOME="${VOLCANO_HOME:-$HOME/.volcano}"
AGENT=""

log() { printf '%s\n' "volcano: $*"; }
warn() { printf '%s\n' "volcano: $*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

home_relative() {
    # Echo a ~-prefixed path when under $HOME (portable, readable), else as-is.
    case "$1" in
    "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;;
    *) printf '%s' "$1" ;;
    esac
}

home_shell_path() {
    # Echo a shell-friendly path that keeps $HOME expansion for copied commands.
    case "$1" in
    "$HOME"/*) printf '$HOME/%s' "${1#"$HOME"/}" ;;
    *) printf '%s' "$1" ;;
    esac
}

while [ $# -gt 0 ]; do
    case "$1" in
    --agent)
        if [ $# -lt 2 ]; then
            warn "--agent requires a value (claude, codex, or cursor)"
            exit 2
        fi
        AGENT="$2"
        shift 2
        ;;
    --agent=*)
        AGENT="${1#*=}"
        shift
        ;;
    -h | --help)
        sed -n '2,24p' "$0" 2>/dev/null || true
        exit 0
        ;;
    *)
        warn "ignoring unknown argument: $1"
        shift
        ;;
    esac
done

download() {
    # download <url> <dest>
    url="$1"
    dest="$2"
    if have curl; then
        curl -fsSL "$url" -o "$dest"
    elif have wget; then
        wget -qO "$dest" "$url"
    else
        warn "need curl or wget"
        return 1
    fi
}

valid_markdown_download() {
    file="$1"
    [ -s "$file" ] || return 1
    if head -c 200 "$file" | grep -qiE '<!doctype html|<html'; then
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Additive, idempotent managed-block upsert.
# upsert_block <file> <body>
# Replaces content between markers if present, else appends a fresh block.
# Preserves all surrounding user content.
# ---------------------------------------------------------------------------
BEGIN_MARKER="# >>> VOLCANO MANAGED BLOCK (do not edit) >>>"
END_MARKER="# <<< VOLCANO MANAGED BLOCK <<<"

# Emit $file to stdout with a *complete* managed block (begin + matching end)
# removed, and trailing blank lines trimmed. Shared by upsert_block and
# remove_block. Safety: if a begin marker has no matching end marker (a
# partial write or a hand-edited file), the block is NOT a well-formed block,
# so everything from the begin marker onward is emitted unchanged rather than
# silently dropped — preserving user content instead of eating it.
strip_managed_block() {
    awk -v b="$BEGIN_MARKER" -v e="$END_MARKER" '
    $0==b && !inblk { inblk=1; n=0; next }
    inblk {
      if ($0==e) { inblk=0; next }   # complete block: drop begin..end inclusive
      buf[++n]=$0                      # buffer candidate block body meanwhile
      next
    }
    { print }
    END {
      if (inblk) {                     # begin with no end: not a real block, restore verbatim
        print b
        for (i=1;i<=n;i++) print buf[i]
      }
    }
  ' "$1" | awk 'NF{last=NR} {line[NR]=$0} END{for(i=1;i<=last;i++) print line[i]}'
}

upsert_block() {
    file="$1"
    body="$2"
    mkdir -p "$(dirname "$file")"
    [ -f "$file" ] || : >"$file"

    if grep -qF "$BEGIN_MARKER" "$file" 2>/dev/null; then
        action="updated"
    else
        action="added"
    fi

    tmp="$(mktemp)"
    strip_managed_block "$file" >"$tmp"
    mv "$tmp" "$file"

    [ -s "$file" ] && printf '\n' >>"$file"
    printf '%s\n%s\n%s\n' "$BEGIN_MARKER" "$body" "$END_MARKER" >>"$file"
    log "$action managed block in $file"
}

# Strip the managed block from a file if present, leaving all other content
# intact. Used in the plugin-first path: when the Volcano plugin is installed
# for an agent, the plugin is the source of truth, so any managed block left
# by a prior no-plugin run of this script must go (otherwise it keeps a
# second, independently-stale AGENTS.md injected alongside the plugin).
remove_block() {
    file="$1"
    [ -f "$file" ] || return 0
    grep -qF "$BEGIN_MARKER" "$file" 2>/dev/null || return 0
    tmp="$(mktemp)"
    strip_managed_block "$file" >"$tmp"
    mv "$tmp" "$file"
    log "removed stale managed block in $file (Volcano plugin present — plugin is the source of truth)"
}

# ---------------------------------------------------------------------------
# CLI install. npm first (matches the plugin-carried install-volcano command),
# GitHub release as fallback, `volcano upgrade` if already on PATH.
# ---------------------------------------------------------------------------
ensure_cli_on_path() {
    cli_dir="$1"

    case ":$PATH:" in
    *":$cli_dir:"*) ;;
    *)
        PATH="$cli_dir:$PATH"
        export PATH
        ;;
    esac

    env_file="$HOME/.volcano/env"
    mkdir -p "$(dirname "$env_file")"
    cat >"$env_file" <<EOF
# Generated by volcano bootstrap. Adds the Volcano CLI install directory to PATH.
# Source from your shell to make 'volcano' callable: . "$env_file"
case ":\$PATH:" in
  *":$cli_dir:"*) ;;
  *) export PATH="$cli_dir:\$PATH" ;;
esac
EOF

    marker_begin="# >>> volcano cli path >>>"
    marker_end="# <<< volcano cli path <<<"
    rc_added=""
    for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
        [ -f "$rc" ] || continue
        if grep -qF "$marker_begin" "$rc" 2>/dev/null; then
            continue
        fi
        {
            printf '\n%s\n' "$marker_begin"
            printf '. "%s"\n' "$env_file"
            printf '%s\n' "$marker_end"
        } >>"$rc"
        rc_added="$rc_added $rc"
    done
    if [ -n "$rc_added" ]; then
        log "added Volcano PATH stub to:$rc_added"
    fi
    log "to use 'volcano' in this shell: . \"$env_file\""
}

npm_global_bin_dir() {
    if npm bin -g >/dev/null 2>&1; then
        npm bin -g
        return 0
    fi
    prefix="$(npm prefix -g 2>/dev/null || true)"
    [ -n "$prefix" ] || return 1
    case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
    mingw* | msys* | cygwin*) printf '%s\n' "$prefix" ;;
    *) printf '%s/bin\n' "$prefix" ;;
    esac
}

npm_managed_cli_installed() {
    have npm && npm ls -g --depth=0 @volcano.dev/cli >/dev/null 2>&1
}

install_cli_from_npm() {
    if ! have npm; then
        warn "npm not found; falling back to GitHub release download"
        return 1
    fi

    pkg="${VOLCANO_CLI_NPM_PACKAGE:-@volcano.dev/cli@latest}"
    log "installing Volcano CLI from npm package $pkg"
    if ! npm install -g "$pkg"; then
        warn "npm install failed; falling back to GitHub release download"
        return 1
    fi

    bin_dir="$(npm_global_bin_dir 2>/dev/null || true)"
    if [ -n "$bin_dir" ]; then
        ensure_cli_on_path "$bin_dir"
    fi

    if have volcano; then
        log "installed Volcano CLI from npm: $(command -v volcano)"
        return 0
    fi

    warn "npm install completed but 'volcano' is not on PATH; falling back to GitHub release download"
    return 1
}

install_cli_from_release() {
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$os" in
    linux*) os="linux" ;;
    darwin*) os="macos" ;;
    mingw* | msys* | cygwin*) os="windows" ;;
    *)
        warn "unsupported OS '$os'; cannot install Volcano CLI from GitHub release"
        return 1
        ;;
    esac
    arch="$(uname -m)"
    case "$arch" in
    x86_64 | amd64) arch="amd64" ;;
    arm64 | aarch64) arch="arm64" ;;
    *)
        warn "unsupported arch '$arch'; cannot install Volcano CLI from GitHub release"
        return 1
        ;;
    esac
    ext=""
    [ "$os" = "windows" ] && ext=".exe"

    case "$WEB_URL" in
    *localhost* | *127.0.0.1*)
        url="https://github.com/Kong/volcano-cli/releases/download/nightly/volcano-${os}-${arch}${ext}"
        log "local Volcano web origin detected; using nightly GitHub CLI fallback"
        ;;
    *)
        url="https://github.com/Kong/volcano-cli/releases/latest/download/volcano-${os}-${arch}${ext}"
        ;;
    esac

    dir="${VOLCANO_INSTALL_DIR:-}"
    if [ -z "$dir" ]; then
        if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then dir="/usr/local/bin"; else dir="$HOME/.local/bin"; fi
    fi
    mkdir -p "$dir"
    out="$dir/volcano${ext}"

    log "downloading Volcano CLI GitHub fallback ($os-$arch) from $url"
    download "$url" "$out"
    chmod 0755 "$out" 2>/dev/null || true
    ensure_cli_on_path "$dir"
    log "installed Volcano CLI GitHub fallback to $out"
}

install_or_upgrade_cli() {
    if have volcano; then
        cli_path="$(command -v volcano)"
        ensure_cli_on_path "$(dirname "$cli_path")"
        log "found Volcano CLI at $cli_path"
        if npm_managed_cli_installed; then
            log "npm-managed Volcano CLI detected; refreshing through npm"
            install_cli_from_npm || warn "npm refresh failed; continuing with existing CLI"
        else
            log "upgrading non-npm Volcano CLI with: volcano upgrade"
            volcano upgrade || warn "volcano upgrade failed; continuing with existing CLI"
        fi
    else
        log "Volcano CLI not found; installing from npm"
        install_cli_from_npm || install_cli_from_release || warn "CLI install failed; continuing without it"
    fi

    if ! have volcano && [ -f "$HOME/.volcano/env" ]; then
        # shellcheck disable=SC1090,SC1091
        . "$HOME/.volcano/env"
    fi

    if have volcano; then
        log "Volcano CLI ready: $(command -v volcano)"
        volcano --version || true
    else
        warn "Volcano CLI installation did not leave 'volcano' on PATH. Try: . \"$HOME/.volcano/env\""
        return 1
    fi
}

# ---------------------------------------------------------------------------
# AGENTS.md + skills. Prefer a plugin-carried skills directory when this
# script happens to run from inside a plugin checkout/cache (mirrors the
# per-plugin install-volcano command's detection); otherwise fetch AGENTS.md
# and the skills manifest from $WEB_URL. No CLAUDE.md fetch — Claude Code
# uses an @-import to ~/.volcano/AGENTS.md instead of a separate file.
# ---------------------------------------------------------------------------
valid_agents_md() {
    file="$1"
    [ -s "$file" ] || return 1
    if head -c 200 "$file" | grep -qiE '<!doctype html|<html'; then
        return 1
    fi
    grep -q 'Volcano' "$file" 2>/dev/null
}

is_plugin_skills_dir() {
    dir="$1"
    [ -f "$dir/AGENTS.md" ] || return 1
    [ -f "$dir/index.json" ] || return 1
    [ -f "$dir/volcano-platform/SKILL.md" ] || return 1
    valid_agents_md "$dir/AGENTS.md"
}

find_plugin_skills_dir() {
    if [ -n "${VOLCANO_PLUGIN_SKILLS_DIR:-}" ] && is_plugin_skills_dir "$VOLCANO_PLUGIN_SKILLS_DIR"; then
        printf '%s\n' "$VOLCANO_PLUGIN_SKILLS_DIR"
        return 0
    fi

    for dir in "$PWD" "$PWD/skills" "$(dirname "$PWD")/skills"; do
        if is_plugin_skills_dir "$dir"; then
            printf '%s\n' "$dir"
            return 0
        fi
    done

    for root in \
        "$HOME/.codex/plugins" \
        "$HOME/.claude/plugins" \
        "$HOME/.cursor"; do
        [ -d "$root" ] || continue
        # -maxdepth bounds the walk to where a plugin-carried skills/AGENTS.md
        # actually lives. Real marketplace/cache layouts nest deeper than a
        # single plugin dir, e.g.
        # ~/.claude/plugins/cache/volcano-agentic-plugins/volcano/<ver>/skills/AGENTS.md
        # (depth 6) and ~/.cursor/plugins/local/volcano/skills/AGENTS.md (depth 5) —
        # 7 covers those with headroom. The roots themselves are scoped to
        # */plugins (or ~/.cursor, which has no large unrelated trees), so this
        # stays bounded — it does not crawl ~/.claude/projects or ~/.claude/todos.
        found="$(find "$root" -maxdepth 7 -type f -path '*/skills/AGENTS.md' 2>/dev/null | while IFS= read -r file; do
            dir="$(dirname "$file")"
            if is_plugin_skills_dir "$dir"; then
                printf '%s\n' "$dir"
                break
            fi
        done)"
        if [ -n "$found" ]; then
            printf '%s\n' "$found"
            return 0
        fi
    done

    return 1
}

# Per-agent plugin detection for the plugin-first wiring path. Unlike
# find_plugin_skills_dir (which answers "is a plugin skills dir reachable from
# anywhere", used to source canonical content), this answers the narrower
# "does THIS agent have the Volcano plugin installed" — so a machine with the
# Claude Code plugin but a bare Codex still wires Codex's no-plugin fallback.
agent_plugin_root() {
    case "$1" in
    claude) printf '%s' "$HOME/.claude/plugins" ;;
    codex) printf '%s' "$HOME/.codex/plugins" ;;
    cursor) printf '%s' "$HOME/.cursor" ;;
    esac
}

agent_has_volcano_plugin() {
    agent="$1"

    # Prefer the agent's authoritative installed-plugins record over scanning
    # for plugin-shaped files: the marketplace clone (e.g.
    # ~/.claude/plugins/marketplaces/.../plugins/*/skills/AGENTS.md) carries
    # the same files even when nothing is installed, so a bare file scan
    # false-positives on "marketplace added but plugin not installed" and
    # would strip a still-needed fallback. Claude Code records actual installs
    # in installed_plugins.json keyed by "<plugin>@<marketplace>".
    if [ "$agent" = "claude" ]; then
        record="$HOME/.claude/plugins/installed_plugins.json"
        [ -f "$record" ] && grep -q '"volcano@volcano-agentic-plugins"' "$record"
        return
    fi

    # Codex/Cursor have no install-record format documented here to read, so
    # fall back to a directory scan — but exclude the marketplace clone and
    # raw git repos (which contain skills/AGENTS.md without an install) to
    # avoid the same false positive. This errs toward keeping the fallback
    # (a slightly stale fallback is a lesser evil than no guidance at all).
    root="$(agent_plugin_root "$agent")"
    [ -n "$root" ] && [ -d "$root" ] || return 1
    found="$(find "$root" -maxdepth 7 -type f -path '*/skills/AGENTS.md' \
        ! -path '*/marketplaces/*' ! -path '*/repos/*' 2>/dev/null | while IFS= read -r file; do
        dir="$(dirname "$file")"
        if is_plugin_skills_dir "$dir"; then
            printf 'y'
            break
        fi
    done)"
    [ -n "$found" ]
}

install_manual_skills() {
    mkdir -p "$VOLCANO_HOME/skills"
    manifest="$(mktemp)"
    if ! download "$WEB_URL/skills/index.json" "$manifest" || ! valid_markdown_download "$manifest"; then
        rm -f "$manifest"
        warn "skills manifest unavailable at $WEB_URL/skills/index.json; skipping skills"
        return 1
    fi

    names="$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$manifest" | sed 's/.*"\([^"]*\)"$/\1/')"
    rm -f "$manifest"
    if [ -z "$names" ]; then
        warn "skills manifest had no skill names; $VOLCANO_HOME/skills not updated"
        return 1
    fi

    for name in $names; do
        case "$name" in
        *[!A-Za-z0-9._-]* | '')
            warn "skipping invalid skill name from manifest: $name"
            continue
            ;;
        esac
        dir="$VOLCANO_HOME/skills/$name"
        tmp="$(mktemp)"
        if download "$WEB_URL/skills/$name/SKILL.md" "$tmp" && valid_markdown_download "$tmp"; then
            mkdir -p "$dir"
            mv "$tmp" "$dir/SKILL.md"
            chmod 0644 "$dir/SKILL.md" 2>/dev/null || true
            log "  skill: $name"
        else
            rm -f "$tmp"
            warn "  skill download failed or invalid: $name"
        fi
    done
}

install_canonical() {
    mkdir -p "$VOLCANO_HOME"

    if plugin_skills_dir="$(find_plugin_skills_dir 2>/dev/null)"; then
        log "using plugin-carried skills as primary source: $plugin_skills_dir"
        cp "$plugin_skills_dir/AGENTS.md" "$VOLCANO_HOME/AGENTS.md"
        chmod 0644 "$VOLCANO_HOME/AGENTS.md" 2>/dev/null || true
        VOLCANO_RESOLVED_SKILLS_DIR="$plugin_skills_dir"
        return 0
    fi

    log "plugin-carried skills not found; fetching canonical AGENTS.md + skills into $VOLCANO_HOME"
    if ! valid_agents_md "$VOLCANO_HOME/AGENTS.md"; then
        tmp="$VOLCANO_HOME/AGENTS.md.tmp"
        mkdir -p "$VOLCANO_HOME"
        if download "$WEB_URL/AGENTS.md" "$tmp" && valid_agents_md "$tmp"; then
            mv "$tmp" "$VOLCANO_HOME/AGENTS.md"
            chmod 0644 "$VOLCANO_HOME/AGENTS.md" 2>/dev/null || true
            log "installed AGENTS.md to $VOLCANO_HOME/AGENTS.md"
        else
            rm -f "$tmp"
            warn "$WEB_URL/AGENTS.md did not return a valid AGENTS.md"
        fi
    else
        log "using existing $VOLCANO_HOME/AGENTS.md"
    fi

    install_manual_skills || warn "continuing without runtime skills"
    VOLCANO_RESOLVED_SKILLS_DIR="$VOLCANO_HOME/skills"
}

# ---------------------------------------------------------------------------
# Symlink resolved skills into an agent's skills dir (idempotent). Never
# clobbers a user's real (non-symlink) skill directory.
# ---------------------------------------------------------------------------
link_skills() {
    skills_dir="$1"
    src_root="${VOLCANO_RESOLVED_SKILLS_DIR:-}"
    [ -n "$src_root" ] && [ -d "$src_root" ] || return 0
    mkdir -p "$skills_dir"
    for src in "$src_root"/*/; do
        [ -d "$src" ] || continue
        name="$(basename "$src")"
        dest="$skills_dir/$name"
        if [ -e "$dest" ] && [ ! -L "$dest" ]; then
            warn "  skipping skill '$name': $dest exists and is not a symlink"
            continue
        fi
        ln -sfn "$src" "$dest" 2>/dev/null || warn "  failed to link skill '$name'"
    done
    log "linked skills into $skills_dir"
}

# Plugin-first cleanup counterpart to link_skills: remove only the skill
# symlinks a prior no-plugin run created, so they don't double-register
# alongside the plugin's own skills. link_skills sources from
# VOLCANO_RESOLVED_SKILLS_DIR, which install_canonical sets to EITHER
# $VOLCANO_HOME/skills OR a plugin skills dir (whenever find_plugin_skills_dir
# succeeded on that prior run) — so a stale symlink may resolve into either.
# Match both: a target under $VOLCANO_HOME/skills, or one whose parent dir is
# itself a Volcano plugin skills dir (has our marker files). Never touches
# real files or unrelated symlinks — only our own.
unlink_volcano_skills() {
    skills_dir="$1"
    [ -d "$skills_dir" ] || return 0
    for dest in "$skills_dir"/*; do
        [ -L "$dest" ] || continue
        target="$(readlink "$dest" 2>/dev/null || true)"
        [ -n "$target" ] || continue
        case "$target" in
        "$VOLCANO_HOME/skills/"* | "$VOLCANO_HOME/skills")
            rm -f "$dest" && log "  unlinked stale skill symlink $dest"
            continue
            ;;
        esac
        # Or: the target is a per-skill dir living directly under a Volcano
        # plugin skills dir (e.g. a prior run linked ~/.claude/skills/* into a
        # plugin cache dir, possibly another agent's). dirname handles a
        # trailing slash from link_skills' "$src_root"/*/ glob.
        if is_plugin_skills_dir "$(dirname "$target")"; then
            rm -f "$dest" && log "  unlinked stale skill symlink $dest (into plugin skills dir)"
        fi
    done
}

# ---------------------------------------------------------------------------
# Per-agent wiring.
# ---------------------------------------------------------------------------
VOLCANO_HOME_LABEL="$(home_relative "$VOLCANO_HOME")"
VOLCANO_HOME_SHELL="$(home_shell_path "$VOLCANO_HOME")"
POINTER_TEXT=$(cat <<EOF
Before any Volcano work, make sure $VOLCANO_HOME_LABEL/AGENTS.md exists and is non-empty. If it is missing or empty, download the canonical instructions first:

\`\`\`sh
mkdir -p "$VOLCANO_HOME_SHELL"
curl -fsSL "$WEB_URL/AGENTS.md" -o "$VOLCANO_HOME_SHELL/AGENTS.md"
\`\`\`

Then read $VOLCANO_HOME_LABEL/AGENTS.md and follow its safety model (read-only/preview actions are automatic; production deploys, deletions, secret/variable changes, permission changes, and billing require confirmation).
EOF
)

wire_claude() {
    # Plugin-first: if the Claude Code plugin is installed, it is the source
    # of truth (its skills carry the guidance; Claude Code loads them
    # on-demand). Wiring a ~/.volcano/AGENTS.md @-import here would just add a
    # second, independently-stale always-on copy that drifts once the plugin
    # updates and ~/.volcano does not. So don't wire it — and strip any block
    # a prior no-plugin run left behind.
    if agent_has_volcano_plugin claude; then
        log "claude: Volcano plugin detected — plugin is the source of truth; not wiring ~/.volcano fallback"
        remove_block "$HOME/.claude/CLAUDE.md"
        unlink_volcano_skills "$HOME/.claude/skills"
        return 0
    fi
    upsert_block "$HOME/.claude/CLAUDE.md" "$POINTER_TEXT

@$VOLCANO_HOME_LABEL/AGENTS.md"
    link_skills "$HOME/.claude/skills"
}

wire_codex() {
    # Plugin-first check goes first: when the plugin is the source of truth we
    # never rely on ~/.codex/AGENTS.md, so the AGENTS.override.md precedence
    # warning below would be misleading (it could prompt the user to needlessly
    # edit or delete their own override file).
    if agent_has_volcano_plugin codex; then
        log "codex: Volcano plugin detected — plugin is the source of truth; not wiring ~/.volcano fallback"
        remove_block "$HOME/.codex/AGENTS.md"
        unlink_volcano_skills "$HOME/.codex/skills"
        return 0
    fi
    if [ -f "$HOME/.codex/AGENTS.override.md" ]; then
        warn "codex: ~/.codex/AGENTS.override.md exists and takes precedence over AGENTS.md;"
        warn "       Volcano instructions may be ignored until you remove or update it."
    fi
    upsert_block "$HOME/.codex/AGENTS.md" "$POINTER_TEXT"
    link_skills "$HOME/.codex/skills"
}

# Cursor has no scriptable global rules surface: the project-scoped
# .cursor/rules/*.mdc file must live inside a project directory (this script
# doesn't know which one), and Settings → Rules → User Rules is stored in
# Cursor's settings DB, unwritable by a shell script. Rather than guessing at
# a project directory, print the exact rule content and let the user paste it
# where it belongs.
prompt_cursor() {
    if agent_has_volcano_plugin cursor; then
        log "cursor: Volcano plugin detected — plugin is the source of truth; no manual rule needed"
        return 0
    fi
    rule_body=$(cat <<EOF
---
description: Volcano usage rules
alwaysApply: true
---
$POINTER_TEXT
EOF
)
    printf '\n'
    log "Cursor has no config file this script can safely write to. Add the"
    log "rule yourself:"
    printf '\n'
    log "  1. Project-scoped (recommended): create .cursor/rules/volcano.mdc"
    log "     in your project with the content below."
    log "  2. Global (Settings -> Rules -> User Rules): paste the same content"
    log "     there to apply it across every Cursor project."
    printf '\n'
    printf '%s\n' "$rule_body"
    printf '\n'
    if have pbcopy; then
        printf '%s\n' "$rule_body" | pbcopy 2>/dev/null && log "(copied to clipboard via pbcopy)"
    elif have wl-copy; then
        printf '%s\n' "$rule_body" | wl-copy 2>/dev/null && log "(copied to clipboard via wl-copy)"
    elif have xclip; then
        printf '%s\n' "$rule_body" | xclip -selection clipboard 2>/dev/null && log "(copied to clipboard via xclip)"
    fi
}

wire_agent() {
    case "$1" in
    claude) wire_claude ;;
    codex) wire_codex ;;
    cursor) prompt_cursor ;;
    *) warn "unknown agent: $1" ;;
    esac
}

detect_agents() {
    found=""
    [ -d "$HOME/.claude" ] && found="$found claude"
    [ -d "$HOME/.codex" ] && found="$found codex"
    [ -d "$HOME/.cursor" ] && found="$found cursor"
    printf '%s' "$found"
}

main() {
    cli_ok=1
    install_or_upgrade_cli || cli_ok=0
    install_canonical

    if [ -n "$AGENT" ]; then
        targets="$AGENT"
    else
        targets="$(detect_agents)"
        if [ -z "$targets" ]; then
            log "no agent config dir detected; skipping agent wiring."
            log "re-run with --agent claude|codex|cursor to wire a specific agent."
        else
            log "auto-detected agents:$targets"
        fi
    fi

    for a in $targets; do
        log "wiring agent: $a"
        wire_agent "$a"
    done

    log "done. Canonical AGENTS.md/skills in $VOLCANO_HOME"

    if [ "$cli_ok" = "1" ]; then
        print_welcome
    else
        warn "AGENTS.md/skills/agent wiring completed, but the Volcano CLI is not installed."
        warn "Fix the CLI install (see the warning above), then re-run this script — it is idempotent."
        exit 1
    fi
}

print_welcome() {
    R='\033[38;5;196m'
    O='\033[38;5;208m'
    Y='\033[38;5;226m'
    D='\033[38;5;52m'
    K='\033[38;5;16m'
    N='\033[0m'
    printf "%b\n" "       ${K}##${N}        "
    printf "%b\n" "     ${R}#${O}##${K}##${N}      "
    printf "%b\n" "    ${R}##${O}####${K}##${N}    "
    printf "%b\n" "     ${D}##${R}##${K}##${N}${K}      "
    printf "%b\n" "      ${D}##${R}##${N}${K}      "
    printf "%b\n" "    ${K}##${R}##${O}##${N}${K}##      "
    printf "%b\n" "  ${K}##${D}##${R}##${O}##${N}${R}##${K}##    "
    printf "%b\n" "  ${K}##${D}##${R}##${Y}##${O}##${N}${R}##${K}##  "
    printf "%b\n" "${K}##${D}##${R}##${O}##${Y}####${O}##${R}##${K}##${N}"
    printf "%b\n" "${K}####################${N}"
    printf '\n'
    printf '  Volcano is set up and ready.\n'
    printf '  What would you like to build?\n'
    printf '\n'
}

main
