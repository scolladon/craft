#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

@test "Given the requirements vertical is authored, when the requirements agent file is checked, then it exists" {
  [ -f "${ROOT}/agents/requirements-writer.md" ]
}

@test "Given the architecture vertical is authored, when the architecture agent file is checked, then it exists" {
  [ -f "${ROOT}/agents/architecture-triager.md" ]
}

@test "Given the requirements vertical is authored, when the requirements skill file is checked, then it exists" {
  [ -f "${ROOT}/skills/requirements/SKILL.md" ]
}

@test "Given the architecture vertical is authored, when the architecture skill file is checked, then it exists" {
  [ -f "${ROOT}/skills/architecture/SKILL.md" ]
}

@test "Given the requirements vertical is authored, when the requirements template file is checked, then it exists" {
  [ -f "${ROOT}/templates/requirements.md" ]
}

@test "Given the requirements skill file exists, when its heading is checked, then it contains the craft:requirements procedure heading" {
  grep -qx '# craft:requirements' "${ROOT}/skills/requirements/SKILL.md"
}

@test "Given the architecture skill file exists, when its heading is checked, then it contains the craft:architecture procedure heading" {
  grep -qx '# craft:architecture' "${ROOT}/skills/architecture/SKILL.md"
}

@test "Given the requirements-writer agent is thin, when it is checked for injected core invariants, then it does not restate them" {
  ! grep -qE 'Never commit on a red gate|No suppression directives' "${ROOT}/agents/requirements-writer.md"
}

@test "Given the architecture-triager agent is thin, when it is checked for injected core invariants, then it does not restate them" {
  ! grep -qE 'Never commit on a red gate|No suppression directives' "${ROOT}/agents/architecture-triager.md"
}

@test "Given the architecture skill is synchronous, when it is checked for mutation-lock clones, then craft-mutation.lock is absent" {
  ! grep -q 'craft-mutation.lock' "${ROOT}/skills/architecture/SKILL.md"
}

@test "Given the loop recipe is authored, when the workflow file is checked, then it exists" {
  [ -f "${ROOT}/examples/loop/workflow.md" ]
}

@test "Given the loop recipe is authored, when the DoD file is checked, then it exists" {
  [ -f "${ROOT}/examples/loop/DOD.md" ]
}

@test "Given the loop recipe is authored, when the README file is checked, then it exists" {
  [ -f "${ROOT}/examples/loop/README.md" ]
}

@test "Given the loop recipe is catalog-indexed, when the GUIDE is checked, then it references examples/loop/" {
  grep -q 'examples/loop/' "${ROOT}/docs/GUIDE-customizing.md"
}

@test "Given the loop recipe is catalog-indexed, when the examples README is checked, then it references loop/" {
  grep -q 'loop/' "${ROOT}/examples/README.md"
}

@test "Given the loop workflow file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear" {
  ! grep -qE 'P21|ADR' "${ROOT}/examples/loop/workflow.md"
}

@test "Given the loop DoD file is provenance-clean, when it is checked for plan references, then no P21 or ADR tokens appear" {
  ! grep -qE 'P21|ADR' "${ROOT}/examples/loop/DOD.md"
}
