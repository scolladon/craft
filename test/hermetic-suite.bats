#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

@test "Given the default-resolution engine tests run from repo-root cwd, then they exit 0 (cwd-hermetic)" {
  run bash -c 'cd "$1" && node --test engine/test/manifest-lint-main.test.js engine/test/contracts-lint-main.test.js' _ "$ROOT"
  [ "$status" -eq 0 ]
}

@test "Given a hostile seeded ambient (HOME with a user policy, cwd with an INVALID default manifest and no contracts dir), when the ambient-sensitive engine tests run, then they still exit 0 (ambient-hermetic, not merely lucky)" {
  HOSTILE_HOME="$(mktemp -d "${BATS_TMPDIR}/craft-hostile-home-XXXXXX")"
  HOSTILE_CWD="$(mktemp -d "${BATS_TMPDIR}/craft-hostile-cwd-XXXXXX")"
  mkdir -p "${HOSTILE_HOME}/.claude" "${HOSTILE_CWD}/.claude"
  # A non-empty user policy: a regressed pipeline-resolve test that reads it would no longer
  # see an empty policy. An INVALID manifest (valid --- fence, malformed YAML body) lints to
  # exit 2: a regressed manifest-lint test that resolves it against cwd would fail result===0.
  # HOSTILE_CWD has no contracts/ dir: a regressed contracts-lint test would lint cwd → exit 2.
  printf -- '---\npolicy:\n  maybe: [integrate]\n---\n' > "${HOSTILE_HOME}/.claude/craft-policy.md"
  printf -- '---\n: : not valid yaml : :\n---\n' > "${HOSTILE_CWD}/.claude/workflow.md"
  run bash -c 'cd "$1" && HOME="$2" USERPROFILE="$2" node --test "$3" "$4" "$5"' _ \
    "$HOSTILE_CWD" "$HOSTILE_HOME" \
    "${ROOT}/engine/test/manifest-lint-main.test.js" \
    "${ROOT}/engine/test/contracts-lint-main.test.js" \
    "${ROOT}/engine/test/pipeline-resolve-main.test.js"
  rm -rf "${HOSTILE_HOME}" "${HOSTILE_CWD}"
  [ "$status" -eq 0 ]
}
