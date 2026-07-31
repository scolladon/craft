#!/usr/bin/env bash
# craft — sync adapter agent mirrors from the shared craft-<role> agent bodies.
#
# Several adapters mirror the shared agents/*.md bodies at
# adapters/<adapter>/agents/craft-<role>.md. This tool replaces the BODY only —
# it never generates frontmatter. Adapters that keep their own frontmatter
# fence above the body have that fence, and the exact run of blank lines
# after its closing marker, preserved byte-for-byte; adapters whose mirrors
# carry no fence at all are treated as body-only (no fence is ever added).
#
# A shared or mirror file whose opening `---` never closes is refused loudly
# (non-zero exit, named file) rather than silently extracting an empty body —
# the previous behaviour let one authoring slip truncate every mirror.
#
# Usage: sync-adapter-agents.sh [--check|--write] [--root <dir>]
#   --check   Report drifted/missing mirrors; exit non-zero if any are found.
#             Read-only. This is the default.
#   --write   Rewrite each drifted mirror's body in place and exit 0 once the
#             tree is fully synced. A role present in agents/ but absent from
#             a mirror directory is reported as "missing" — never created, in
#             either mode — and still exits non-zero, since --write cannot
#             fix it.
#   --root    Repo root to operate under (test seam; defaults to the repo
#             this script lives in).
set -euo pipefail
# Byte-wise, not collation-dependent: under several real locales (e.g.
# en_US.UTF-8) a `[a-z]*` case pattern matches uppercase-initial names too,
# because bracket-expression ranges follow the locale's collation order, not
# ASCII. The roles shape-guard below needs strict ASCII lowercase, and `sort`
# needs a stable byte order, so the whole script runs in the C locale.
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"

while [ $# -gt 0 ]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --write)
      MODE="write"
      shift
      ;;
    --root)
      ROOT="${2:?usage: sync-adapter-agents.sh [--check|--write] [--root <dir>]}"
      shift 2
      ;;
    *)
      echo "sync-adapter-agents: unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

AGENTS_DIR="$ROOT/agents"
ADAPTERS_DIR="$ROOT/adapters"
[ -d "$AGENTS_DIR" ] || { echo "sync-adapter-agents: no such directory: $AGENTS_DIR" >&2; exit 2; }
[ -d "$ADAPTERS_DIR" ] || { echo "sync-adapter-agents: no such directory: $ADAPTERS_DIR" >&2; exit 2; }

TMP_DIR="$(mktemp -d)"
# pending_tmp names an in-flight per-mirror staging file (created directly in
# the mirror's own directory so --write's final `mv` is always a same-filesystem
# rename, never a degrade-to-copy). Tracked here so a failure mid-write (e.g.
# an unclosed fence discovered while building the new content) cleans it up
# instead of leaving a stray dotfile behind. cleanup() captures $? BEFORE
# running anything else — an EXIT trap that doesn't do this silently resets
# the script's exit status to the trap's own (a bare `rm -rf` exits 0), which
# is exactly how a fatal `set -u` abort on an empty array used to report
# success.
pending_tmp=""
status=""
trap 'status=$?; rm -rf "$TMP_DIR"; [ -z "$pending_tmp" ] || rm -f "$pending_tmp"; exit "$status"' EXIT
shared_body_file="$TMP_DIR/shared-body"
mirror_body_file="$TMP_DIR/mirror-body"

# frontmatter_prefix <file> — the opening `---` fence through the closing
# fence, plus the exact run of blank lines immediately after it. Empty output
# if the file's very first line is not `---`. Fails loudly (exit 2, message
# naming the file) if the fence opens but never closes, instead of printing
# the whole file — an unclosed mirror fence would otherwise turn --write's
# body replacement into an unbounded append.
frontmatter_prefix() {
  awk '
    NR==1 && $0=="---" { print; infence=1; next }
    infence && !closed { print; if ($0=="---") closed=1; next }
    closed && $0=="" { print; next }
    { exit }
    END {
      if (infence && !closed) {
        print "sync-adapter-agents: " FILENAME ": missing closing frontmatter fence" > "/dev/stderr"
        exit 2
      }
    }
  ' "$1"
}

# frontmatter_body <file> — the line-exact extraction rule shared with the
# per-adapter byte-identity guards: split at the `---` fences, take
# everything after the closing fence, then strip only the LEADING run of
# blank lines. Fails loudly (exit 2, message naming the file) if the fence
# opens but never closes, instead of silently extracting an empty body.
frontmatter_body() {
  awk '
    NR==1 && $0=="---" { infence=1; next }
    infence && !closed { if ($0=="---") closed=1; next }
    (closed || !infence) && !started && $0=="" { next }
    { started=1; print }
    END {
      if (infence && !closed) {
        print "sync-adapter-agents: " FILENAME ": missing closing frontmatter fence" > "/dev/stderr"
        exit 2
      }
    }
  ' "$1"
}

has_fence() {
  [ "$(head -n 1 "$1")" = "---" ]
}

# Roles are every lowercase-initial agents/*.md basename — matching every
# real role's kebab-case naming — so a doc file dropped alongside them (e.g.
# agents/README.md) is never synthesised into a role and reported as "missing"
# in all six adapters. Symmetric with the adapters/ discovery below: a shape
# that isn't a mirroring target is silently excluded, not treated as an error.
roles=()
while IFS= read -r f; do
  role="$(basename "$f" .md)"
  case "$role" in
    [a-z]*) roles+=("$role") ;;
    *) : ;;
  esac
done < <(find "$AGENTS_DIR" -maxdepth 1 -name '*.md' | sort)

if [ "${#roles[@]}" -eq 0 ]; then
  echo "sync-adapter-agents: no roles found under $AGENTS_DIR" >&2
  exit 1
fi

# Mirroring adapters are discovered by the existence of adapters/*/agents/,
# never by a hardcoded list — an adapter with no agents/ directory (the pi
# shape) is not a mirroring adapter and is never reported. The exclusion of a
# SYMLINKED agents/ dir is kept (never followed into, never written through)
# but made loud: `-type l` still matches the symlink entry itself (`find`'s
# default -P never traverses it), and it is refused rather than silently
# skipped.
adapters=()
while IFS= read -r d; do
  if [ -L "$d" ]; then
    echo "sync-adapter-agents: refusing a symlinked agents/ directory: $d" >&2
    exit 2
  fi
  adapters+=("$(basename "$(dirname "$d")")")
done < <(find "$ADAPTERS_DIR" -mindepth 2 -maxdepth 2 \( -type d -o -type l \) -name agents | sort)

if [ "${#adapters[@]}" -eq 0 ]; then
  echo "sync-adapter-agents: no mirroring adapters found under $ADAPTERS_DIR" >&2
  exit 1
fi

# Role outer, adapter inner: each shared body is extracted once per role
# (nine extractions) instead of once per mirror (fifty-four), and the
# empty-body refusal below runs once per role rather than being repeated
# per adapter.
problems=()
rewrites=()
for role in ${roles[@]+"${roles[@]}"}; do
  shared_file="$AGENTS_DIR/$role.md"
  frontmatter_body "$shared_file" > "$shared_body_file" || exit "$?"

  # A closed fence around a genuinely empty body is a different pathological
  # shape than an unclosed one (already refused above) — still refuse it,
  # since writing it out would truncate every mirror for this role.
  if [ ! -s "$shared_body_file" ]; then
    echo "sync-adapter-agents: $role: extracted shared body is empty ($shared_file) — refusing to sync" >&2
    exit 1
  fi

  for adapter in ${adapters[@]+"${adapters[@]}"}; do
    mirror_file="$ADAPTERS_DIR/$adapter/agents/craft-$role.md"

    if [ ! -f "$mirror_file" ]; then
      problems+=("sync-adapter-agents: $adapter/$role: missing")
      continue
    fi

    if has_fence "$mirror_file"; then
      frontmatter_body "$mirror_file" > "$mirror_body_file" || exit "$?"
    else
      cp "$mirror_file" "$mirror_body_file"
    fi

    if cmp -s "$shared_body_file" "$mirror_body_file"; then
      continue
    fi

    if [ "$MODE" = "write" ]; then
      # Stage in the mirror's OWN directory (never $TMP_DIR) so the final mv
      # is always a same-filesystem rename, never copy-then-unlink; clone the
      # mirror's mode via `cp -p` before the content is overwritten by a plain
      # truncating write, which never resets an existing file's mode.
      tmp="$(mktemp "$(dirname "$mirror_file")/.craft-sync.XXXXXX")"
      pending_tmp="$tmp"
      cp -p "$mirror_file" "$tmp"
      if has_fence "$mirror_file"; then
        frontmatter_prefix "$mirror_file" > "$tmp" || exit "$?"
        cat "$shared_body_file" >> "$tmp"
      else
        cp "$shared_body_file" "$tmp"
      fi
      mv "$tmp" "$mirror_file"
      pending_tmp=""
      rewrites+=("sync-adapter-agents: $adapter/$role: rewritten")
    else
      problems+=("sync-adapter-agents: $adapter/$role: drifted")
    fi
  done
done

if [ "${#rewrites[@]}" -gt 0 ]; then
  printf '%s\n' "${rewrites[@]}"
fi

if [ "${#problems[@]}" -gt 0 ]; then
  printf '%s\n' "${problems[@]}" >&2
  exit 1
fi

# --write means "the tree is synced", not "I changed things": a fully
# successful repair exits 0 so it can sit in a `set -e` hook or make target.
# Only a mirror --write cannot fix (missing, never created) keeps the exit
# non-zero, in either mode. A positive line on this clean path makes a
# 0-checked run (every array empty, everything vacuously "in sync")
# distinguishable from a real N-checked pass.
checked=$(( ${#roles[@]} * ${#adapters[@]} ))
echo "sync-adapter-agents: $checked mirrors in sync across ${#adapters[@]} adapters."
exit 0
