#!/bin/bash
# forge — validate the repo declination manifest (.claude/workflow.md frontmatter).
# Fails LOUDLY on unknown keys, skip-on-protected-phase, and dangling file references.
# Shared by the run orchestrator and every standalone phase skill (single parse home).
#
# Parses a deliberate YAML SUBSET: two levels + inline { k: v, ... } maps. Anything
# fancier belongs in the markdown body, not the frontmatter.
#
# Usage: manifest-lint.sh [manifest-path]   (default: .claude/workflow.md)
set -euo pipefail

MF="${1:-.claude/workflow.md}"
if [ ! -f "$MF" ]; then
  echo "forge-manifest: no manifest at $MF — pure defaults via capability probing."
  exit 0
fi
ROOT=$(dirname "$(dirname "$MF")")

FM=$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$MF")
if [ -z "$FM" ]; then
  echo "forge-manifest: $MF has no YAML frontmatter — pure defaults."
  exit 0
fi

TOP_KEYS="backlog paths context gates phases pr scripts models"
PHASE_NAMES="branch design adr plan implement review refactor mutation docs pr merge"
PHASE_FIELDS="context override skip strategy merge-flags non-blocking-jobs"
GATE_FIELDS="slice phase review-batch"
PR_FIELDS="creator pre-pr-gate"
SCRIPT_FIELDS="post-setup pre-teardown"
MODELS_KEYS="fallback designer planner reviewer slice-implementer refactor-executor mutation-triager docs-writer backlog-ticker"
PROTECTED="branch plan implement review refactor mutation"

ERRORS=""
err() { ERRORS="${ERRORS}\n- $1"; }
in_list() { case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac }

check_one_file() { # $1=key $2=single-path
  case "$2" in ""|"~") return 0 ;; esac
  [ -f "$ROOT/$2" ] || [ -f "$2" ] || err "$1 references missing file: $2"
}

check_file_ref() { # $1=key $2=path-value (single, or [a, b] list)
  case "$2" in
    '['*']')
      local inner; inner=$(printf '%s' "$2" | sed -E 's/^\[ *//; s/ *\]$//')
      local IFS=','; local f
      for f in $inner; do check_one_file "$1" "$(printf '%s' "$f" | sed -E 's/^ *//; s/ *$//')"; done ;;
    *) check_one_file "$1" "$2" ;;
  esac
}

SECTION=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  indent=$(($(printf '%s' "$line" | sed -E 's/[^ ].*$//' | wc -c)))
  key=$(printf '%s' "$line" | sed -E 's/^ *([A-Za-z-]+):.*$/\1/')
  val=$(printf '%s' "$line" | sed -E 's/^ *[A-Za-z-]+: *//; s/ *#.*$//')

  if [ "$indent" -eq 0 ]; then
    SECTION="$key"
    in_list "$key" "$TOP_KEYS" || err "unknown top-level key: $key"
    # Inline-map values: validate sub-keys + file refs.
    case "$val" in
      '{'*'}')
        inner=$(printf '%s' "$val" | sed -E 's/^\{ *//; s/ *\}$//')
        # Protect commas inside [...] arrays from the pair split.
        while printf '%s' "$inner" | grep -qE '\[[^]]*,[^]]*\]'; do
          inner=$(printf '%s' "$inner" | sed -E 's/(\[[^]]*),([^]]*\])/\1¦\2/')
        done
        IFS=',' read -ra pairs <<< "$inner"
        for p in "${pairs[@]}"; do
          case "$p" in *:*) ;; *) continue ;; esac
          k=$(printf '%s' "$p" | sed -E 's/^ *([A-Za-z-]+):.*/\1/')
          v=$(printf '%s' "$p" | sed -E 's/^ *[A-Za-z-]+: *//; s/ *$//' | tr '¦' ',')
          case "$SECTION" in
            pr)      in_list "$k" "$PR_FIELDS"     || err "unknown pr field: $k" ;;
            scripts) in_list "$k" "$SCRIPT_FIELDS" || err "unknown scripts field: $k"
                     check_file_ref "scripts.$k" "$v" ;;
            models)  in_list "$k" "$MODELS_KEYS"   || err "unknown models key: $k (expected an agent name or 'fallback')" ;;
            paths|gates) : ;;
          esac
        done ;;
      *)
        case "$SECTION" in
          context) check_file_ref "context" "$val" ;;
        esac ;;
    esac
  elif [ "$indent" -ge 2 ]; then
    case "$SECTION" in
      gates)  in_list "$key" "$GATE_FIELDS" || err "unknown gates field: $key" ;;
      phases)
        if [ "$indent" -eq 2 ]; then
          PHASE="$key"
          in_list "$key" "$PHASE_NAMES" || err "unknown phase: $key"
          case "$val" in
            '{'*'}')
              inner=$(printf '%s' "$val" | sed -E 's/^\{ *//; s/ *\}$//')
              while printf '%s' "$inner" | grep -qE '\[[^]]*,[^]]*\]'; do
                inner=$(printf '%s' "$inner" | sed -E 's/(\[[^]]*),([^]]*\])/\1¦\2/')
              done
              IFS=',' read -ra pairs <<< "$inner"
              for p in "${pairs[@]}"; do
                case "$p" in *:*) ;; *) continue ;; esac
                k=$(printf '%s' "$p" | sed -E 's/^ *([A-Za-z-]+):.*/\1/')
                v=$(printf '%s' "$p" | sed -E 's/^ *[A-Za-z-]+: *//; s/ *$//' | tr '¦' ',')
                in_list "$k" "$PHASE_FIELDS" || err "unknown field on phase $PHASE: $k"
                case "$k" in
                  skip) in_list "$PHASE" "$PROTECTED" && err "skip: is refused on protected phase '$PHASE' (sequence-editing in disguise)" ;;
                  context|override) check_file_ref "phases.$PHASE.$k" "$v" ;;
                esac
              done ;;
          esac
        else
          in_list "$key" "$PHASE_FIELDS" || err "unknown field on phase $PHASE: $key"
          case "$key" in
            skip) in_list "$PHASE" "$PROTECTED" && err "skip: is refused on protected phase '$PHASE' (sequence-editing in disguise)" ;;
            context|override) check_file_ref "phases.$PHASE.$key" "$val" ;;
          esac
        fi ;;
    esac
  fi
done <<< "$FM"

if [ -n "$ERRORS" ]; then
  echo "forge-manifest: INVALID manifest $MF:" >&2
  printf '%b\n' "$ERRORS" >&2
  echo "Fix the manifest — forge refuses to run on a misconfigured declination (fail loudly, never silently)." >&2
  exit 2
fi
echo "forge-manifest: $MF valid."
