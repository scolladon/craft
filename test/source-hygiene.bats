#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

# Explicit scanned-path list (not `grep -r .`):
# engine/test/, scripts/, .claude/, examples/, and dated docs are NEVER scanned.
SCANNED_PATHS=(
  "${ROOT}/pipeline"
  "${ROOT}/skills"
  "${ROOT}/agents"
  "${ROOT}/contracts"
  "${ROOT}/templates"
  "${ROOT}/engine/src"
  "${ROOT}/docs/adapters"
  "${ROOT}/docs/DOD.md"
  "${ROOT}/docs/GUIDE-customizing.md"
  "${ROOT}/README.md"
)

# Class A: technique-specific tool and concept names that must not appear in plugin sources.
CLASS_A_PATTERN='stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise'

# Class B: VCS-host CLI references (word-boundary to avoid substrings like
# "through", "weight", "light", "high", "right").
CLASS_B_PATTERN='\bgh\b|\bgithub\b'

@test "Given Parts 1-10 removed technique names, when class-A tokens are grepped across the scanned set, then zero un-allowlisted hits remain" {
  # Run grep; pipe through allowlist filters; assert residual count is zero.
  offenders=$(
    grep -rEn "${CLASS_A_PATTERN}" "${SCANNED_PATHS[@]}" 2>/dev/null \
    | grep -vE "equivalent mutant|EQUIVALENT-MUTANT|mutant unreachable" \
    | grep -vE "/docs/adapters/pi-poc-record\.md:" \
    || true
    # 'equivalent mutant' / 'EQUIVALENT-MUTANT' / 'mutant unreachable': kept dogfood
    # comments documenting why specific lines survive mutation analysis — intentional
    # evidence in engine/src/**; a mutant-name comment outside this pattern still fails.
    # docs/adapters/pi-poc-record.md: frozen PoC record — filesystem-mutation sense
    # ("Pi's mutations confined to throwaway"), not a technique-name leak.
    # No engine/src technique-token exception: the deprecated agent name kept for
    # back-compat (validation-triager) is a phase name, not a technique, so it needs none.
  )
  if [ -n "${offenders}" ]; then
    printf 'Source-hygiene FAIL — un-allowlisted class-A hits:\n%s\n' "${offenders}" >&2
    false
  fi
}

@test "Given Parts 1-10 removed VCS-host CLI references, when class-B tokens are grepped across the scanned set, then zero un-allowlisted hits remain" {
  # Run grep; pipe through allowlist filters; assert residual count is zero.
  offenders=$(
    grep -rEn "${CLASS_B_PATTERN}" "${SCANNED_PATHS[@]}" 2>/dev/null \
    | grep -vE "/docs/adapters/vcs\.md:[0-9]+:.*CLI called directly" \
    | grep -vE "/docs/adapters/backlog\.md:" \
    | grep -vE "engine/src/manifest\.js:[0-9]+:.*github-issues" \
    | grep -vE "docs/GUIDE-customizing\.md:[0-9]+:.*file / gh /" \
    || true
    # docs/adapters/vcs.md: content-scoped exemption — only the adapter binding lines
    # ("git and gh CLI called directly", "same git/gh CLI called directly by the
    # adapter") carry the binding marker "CLI called directly"; that is the reviewed
    # boundary where the host CLI is allowed to live. A future 'gh' in vcs.md PROSE
    # (outside a "CLI called directly" binding line) is NOT exempt and trips this gate.
    # docs/adapters/backlog.md: the Backlog port adapter recipe documents 'gh' as
    # an example custom-script tool — an allowed host-CLI location (Backlog axis,
    # not VCS axis).
    # engine/src/manifest.js 'github-issues': the NON_BUILTIN_TRACKERS constant
    # names the backlog tracker id — a tracker name, not a VCS-host CLI reference.
    # docs/GUIDE-customizing.md 'file / gh /': the Backlog-axis label in the
    # hexagon diagram (line 58) — explicitly kept (Backlog port, out of scope
    # per Part 9 plan note).
  )
  if [ -n "${offenders}" ]; then
    printf 'Source-hygiene FAIL — un-allowlisted class-B hits:\n%s\n' "${offenders}" >&2
    false
  fi
}
