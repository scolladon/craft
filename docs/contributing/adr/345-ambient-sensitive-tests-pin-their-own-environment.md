# 345 — A test asserting binary-absent behaviour pins its own environment

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** none

## Context

`adapters/pi/test/cli.test.js` spawns `adapters/pi/src/cli.js` as a real subprocess and
asserts `result.status === 2` — the exit code `main()` produces when the `pi` binary
cannot be found. The file says so in its own comment: "The pi binary is not installed in
CI so main() always exits 2".

That premise is a property of the CI runner's software inventory, not of the test. On a
developer machine with `pi` installed — the normal case for anyone working on craft's
adapters — `cli.js` reaches a real `pi`, which blocks, and `bash scripts/ci.sh` hangs for
tens of minutes rather than failing. The failure mode is local-only, which is why it
survived. The test passes in CI by accident.

The reported workaround was to prepend a directory of `exit 127` stubs for eight agent
binaries onto `PATH`. That is undocumented, every contributor rediscovers it, and stubbing
seven binaries with no evidence they hang risks making a real adapter test pass vacuously.

## Options considered

1. **Hermetic per-test environment** — a `mkdtemp` root with a synthetic `PATH` (symlinks
   for `node` and `git` only) and a `git init` cwd, so the spawn resolves a genuine OS
   `ENOENT` for `pi` — pros: removes the hang and makes the assertion mean what it claims;
   measured exit 2 in 157 ms against SIGTERM at a 30 s bound today / cons: more setup code
   in the test. *(designer's recommendation)*
2. **Document the `PATH`-stub workaround** in CONTRIBUTING and change no test — pros: zero
   test churn / cons: leaves the gate green-by-accident on CI; adds a step every
   contributor must know; a stub returning a rehearsed exit code is exactly the vacuous
   pass the change exists to prevent.
3. **Skip the three subprocess tests when `pi` resolves on `PATH`** — pros: trivial /
   cons: the suite silently covers less on precisely the machines that develop the adapter.

## Decision

A test that asserts *binary-absent* behaviour **constructs the absence it asserts**. It
does not infer absence from the ambient machine.

Concretely, the three subprocess tests in `adapters/pi/test/cli.test.js` run under a
hermetic environment: a temporary root, a synthetic `PATH` containing only the
interpreters the code under test legitimately needs, and a temporary cwd. The absence of
`pi` is then a real `spawn pi ENOENT` from the OS — never a stub returning a rehearsed
code, so nothing can pass vacuously.

This generalises: **ambient state a test depends on is state the test must establish.**
`test/hermetic-suite.test.js` already applies this to `HOME` and cwd; this ADR extends the
same discipline to `PATH`.

## Consequences

- `bash scripts/ci.sh` becomes runnable on a machine with agent binaries installed, with
  no `PATH` preamble and no documented workaround.
- The gate strengthens rather than weakens: the assertion now holds by construction on
  every machine instead of by inventory on one.
- The `exit 127` stub recipe is deliberately **not** adopted or documented; it is
  superseded by construction.
- Any future test that spawns a real binary inherits this obligation. A test that cannot
  construct its ambient preconditions is a test that should inject its dependency instead.
