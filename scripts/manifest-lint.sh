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

# ---------------------------------------------------------------------------
# parse_frontmatter — single parse seam
#
# Emits flat "key.sub.sub = value" props lines from the YAML frontmatter.
# When yq (mikefarah) is available it is the primary backend; otherwise the
# subset parser below produces the same format.  Both paths feed the same
# validate_props() loop — backend is invisible to callers.
# ---------------------------------------------------------------------------
parse_frontmatter() {
  if command -v yq > /dev/null 2>&1; then
    printf '%s\n' "$FM" | yq -o=props '.. comments=""' 2>/dev/null
  else
    _subset_parser_props
  fi
}

# ---------------------------------------------------------------------------
# _emit_scalar_or_array — emit one prop or expand an inline YAML array.
#
# Scalar:  key.path = value
# Array:   key.path.0 = elem0 / key.path.1 = elem1 / …
# ---------------------------------------------------------------------------
_emit_scalar_or_array() { # $1=key-path $2=value
  local path="$1" val="$2"
  case "$val" in
    '['*']')
      local inner idx=0
      inner=$(printf '%s' "$val" | sed -E 's/^\[ *//; s/ *\]$//')
      # Protect commas inside nested brackets before splitting.
      while printf '%s' "$inner" | grep -qE '\[[^]]*,[^]]*\]'; do
        inner=$(printf '%s' "$inner" | sed -E 's/(\[[^]]*),([^]]*\])/\1¦\2/')
      done
      IFS=',' read -ra elems <<< "$inner"
      for elem in "${elems[@]}"; do
        local ev
        ev=$(printf '%s' "$elem" | sed -E 's/^ *//; s/ *$//' | tr '¦' ',')
        ev=$(printf '%s' "$ev"  | sed -E 's/^ *["'"'"']//; s/["'"'"'] *$//')
        printf '%s.%s = %s\n' "$path" "$idx" "$ev"
        idx=$((idx + 1))
      done ;;
    *)
      printf '%s = %s\n' "$path" "$val" ;;
  esac
}

# Strip surrounding quotes and trailing comment from a scalar value string.
_strip_quotes_comment() {
  printf '%s' "$1" | sed -E 's/ *#.*$//; s/^ *["'"'"']//; s/["'"'"'] *$//'
}

# ---------------------------------------------------------------------------
# _subset_parser_props — fallback when yq is absent
#
# Walks the YAML subset (two levels + inline maps) and emits props lines that
# are structurally equivalent to "yq -o=props '.. comments=""'" output.
# ---------------------------------------------------------------------------
_subset_parser_props() {
  local section="" phase="" indent key val inner

  while IFS= read -r line; do
    # Skip blank lines and comment-only lines.
    case "$line" in ''|'#'*) continue ;; esac
    indent=$(($(printf '%s' "$line" | sed -E 's/[^ ].*$//' | wc -c)))
    key=$(printf '%s' "$line" | sed -E 's/^ *([A-Za-z0-9_-]+):.*$/\1/')
    val=$(printf '%s' "$line" | sed -E 's/^ *[A-Za-z0-9_-]+: *//')

    if [ "$indent" -eq 0 ]; then
      section="$key"
      case "$val" in
        '{'*'}')
          # Inline map: emit one prop per sub-key.
          inner=$(printf '%s' "$val" | sed -E 's/^\{ *//; s/ *\}$//')
          # Protect commas inside [...] arrays from the pair split.
          while printf '%s' "$inner" | grep -qE '\[[^]]*,[^]]*\]'; do
            inner=$(printf '%s' "$inner" | sed -E 's/(\[[^]]*),([^]]*\])/\1¦\2/')
          done
          IFS=',' read -ra pairs <<< "$inner"
          for p in "${pairs[@]}"; do
            case "$p" in *:*) ;; *) continue ;; esac
            local pk pv
            pk=$(printf '%s' "$p" | sed -E 's/^ *([A-Za-z0-9_-]+):.*/\1/')
            pv=$(printf '%s' "$p" | sed -E 's/^ *[A-Za-z0-9_-]+: *//' | tr '¦' ',')
            pv=$(_strip_quotes_comment "$pv")
            _emit_scalar_or_array "${section}.${pk}" "$pv"
          done ;;
        '')
          # Section header with sub-keys to follow — nothing to emit here.
          : ;;
        *)
          # Top-level scalar (e.g. "backlog: my-backlog").
          local sv
          sv=$(_strip_quotes_comment "$val")
          printf '%s = %s\n' "$section" "$sv" ;;
      esac

    elif [ "$indent" -ge 2 ]; then
      case "$section" in
        phases)
          if [ "$indent" -eq 2 ]; then
            phase="$key"
            case "$val" in
              '{'*'}')
                # Inline phase map: emit one prop per field.
                inner=$(printf '%s' "$val" | sed -E 's/^\{ *//; s/ *\}$//')
                while printf '%s' "$inner" | grep -qE '\[[^]]*,[^]]*\]'; do
                  inner=$(printf '%s' "$inner" | sed -E 's/(\[[^]]*),([^]]*\])/\1¦\2/')
                done
                IFS=',' read -ra pairs <<< "$inner"
                for p in "${pairs[@]}"; do
                  case "$p" in *:*) ;; *) continue ;; esac
                  local fk fv
                  fk=$(printf '%s' "$p" | sed -E 's/^ *([A-Za-z0-9_-]+):.*/\1/')
                  fv=$(printf '%s' "$p" | sed -E 's/^ *[A-Za-z0-9_-]+: *//' | tr '¦' ',')
                  fv=$(_strip_quotes_comment "$fv")
                  _emit_scalar_or_array "phases.${phase}.${fk}" "$fv"
                done ;;
              '')
                # Phase block header — sub-fields follow on deeper lines.
                : ;;
            esac
          else
            # indent >= 4: phase field value.
            local fv2
            fv2=$(_strip_quotes_comment "$val")
            _emit_scalar_or_array "phases.${phase}.${key}" "$fv2"
          fi ;;
        *)
          # Non-phase section sub-key (e.g. gates.slice, pr.creator).
          local gv
          gv=$(_strip_quotes_comment "$val")
          printf '%s = %s\n' "${section}.${key}" "$gv" ;;
      esac
    fi
  done <<< "$FM"
}

# ---------------------------------------------------------------------------
# validate_props — consume normalized props and accumulate validation errors
#
# Each line is "dotted.key = value".  The dotted key encodes the YAML path:
#   section = value                      (top-level scalar)
#   section.key = value                  (sub-key)
#   section.key.N = value                (N=digit: array element of key)
#   phases.PHASE.field = value
#   phases.PHASE.field.N = value
# ---------------------------------------------------------------------------
validate_props() {
  local props="$1"
  local seen_sections=""

  while IFS= read -r prop_line; do
    # Skip blank lines and comment lines (yq may emit comments between nodes).
    case "$prop_line" in ''|'#'*) continue ;; esac

    # Split "dotted.key = value" on the first " = ".
    local prop_key prop_val
    prop_key="${prop_line%% = *}"
    prop_val="${prop_line#* = }"
    # If there was no " = " separator the line is not a valid prop; skip it.
    [ "$prop_key" = "$prop_line" ] && continue

    # Decompose the dotted key into path components.
    local p1 p2 p3
    p1="${prop_key%%.*}"
    local rest="${prop_key#*.}"
    if [ "$rest" = "$prop_key" ]; then
      # No dot — purely top-level scalar (e.g. "backlog").
      p2="" p3=""
    else
      p2="${rest%%.*}"
      rest="${rest#*.}"
      if [ "$rest" = "${prop_key#*.}" ]; then
        p3=""
      else
        p3="${rest%%.*}"
      fi
    fi

    # Validate top-level section (deduplicate to avoid repeated errors).
    case " $seen_sections " in *" $p1 "*) ;; *)
      seen_sections="${seen_sections} ${p1}"
      in_list "$p1" "$TOP_KEYS" || err "unknown top-level key: $p1"
    ;; esac

    case "$p1" in
      backlog|paths|models)
        case "$p1" in
          models)
            in_list "$p2" "$MODELS_KEYS" || err "unknown models key: $p2 (expected an agent name or 'fallback')" ;;
        esac ;;

      context)
        # Top-level context: scalar path or array element path (depth=1 or 2).
        check_one_file "context" "$prop_val" ;;

      gates)
        # gates.FIELD or gates.FIELD.N (array element): validate the field name.
        local gf="$p2"
        # When the field itself is a numeric index the path was gates.N — that
        # shouldn't occur in valid YAML but guard defensively.
        case "$gf" in [0-9]*) continue ;; esac
        in_list "$gf" "$GATE_FIELDS" || err "unknown gates field: $gf" ;;

      pr)
        local prf="$p2"
        case "$prf" in [0-9]*) continue ;; esac
        in_list "$prf" "$PR_FIELDS" || err "unknown pr field: $prf" ;;

      scripts)
        # scripts.FIELD or scripts.FIELD.N = file-path
        local sf="$p2"
        case "$sf" in [0-9]*) continue ;; esac
        in_list "$sf" "$SCRIPT_FIELDS" || err "unknown scripts field: $sf"
        check_one_file "scripts.${sf}" "$prop_val" ;;

      phases)
        # phases.PHASE[.FIELD[.N]]
        local ph="$p2"
        case "$ph" in [0-9]*) continue ;; esac
        in_list "$ph" "$PHASE_NAMES" || err "unknown phase: $ph"
        # Only validate field when one is present (depth >= 3).
        if [ -n "$p3" ]; then
          # The field name is p3; p4 (if numeric) is an array index.
          local base_fld="$p3"
          case "$base_fld" in [0-9]*) continue ;; esac
          in_list "$base_fld" "$PHASE_FIELDS" || err "unknown field on phase $ph: $base_fld"
          case "$base_fld" in
            skip)
              in_list "$ph" "$PROTECTED" && err "skip: is refused on protected phase '$ph' (sequence-editing in disguise)" ;;
            context|override)
              check_one_file "phases.${ph}.${base_fld}" "$prop_val" ;;
          esac
        fi ;;
    esac
  done <<< "$props"
}

PROPS=$(parse_frontmatter)

validate_props "$PROPS"

if [ -n "$ERRORS" ]; then
  echo "forge-manifest: INVALID manifest $MF:" >&2
  printf '%b\n' "$ERRORS" >&2
  echo "Fix the manifest — forge refuses to run on a misconfigured declination (fail loudly, never silently)." >&2
  exit 2
fi
echo "forge-manifest: $MF valid."
