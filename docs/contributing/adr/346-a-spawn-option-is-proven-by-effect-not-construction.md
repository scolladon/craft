# 346 — A subprocess option is proven by its effect, never by its construction

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** none

## Context

`adapters/pi/src/run.js` `spawnPi` passes a stdin-ignore discipline through
`runSubprocess`, which is built on `child_process.execFile`. Measured: **`execFile`
silently drops the `stdio` option.** A `cat` spawned with `stdio: ['ignore', …]` under
`execFile` is still running at 2500 ms (its stdin stayed a pipe); the same intent under
`spawn` exits in 4 ms.

So the documented discipline at `run.js:90,105` is inert, and a real `pi` blocks forever —
SIGTERM at a 20 s bound with zero output, where `spawn` returns in 1317 ms.

Two tests, `adapters/pi/test/run.test.js:488` and `:717`, are green over that hang. They
assert the option was *constructed* on an injected spy. Neither can observe that the
runtime ignores it. This is the same defect class the change containing this ADR exists to
close — a harness reporting a state that is not the real one — and it sits inside that
scope line.

## Options considered

1. **Fix now** — `runSubprocess` ends the returned child's stdin, with a test that spawns a
   real child blocked on stdin — pros: closes the cause, not just the symptom; testable
   without `pi` installed; keeps the `execFileFn` DI seam / cons: widens this change by one
   production file. *(designer's recommendation)*
2. **Leave it, file a follow-up** — pros: narrower PR / cons: ships the fix for the test
   hang while production `spawnPi` still hangs against a real `pi`, and leaves two green
   tests standing over it.
3. **Rewrite `runSubprocess` from `execFile` to `spawn`** with explicit stdio and manual
   stream collection — pros: the option would be honoured natively / cons: a larger rewrite
   of a function shared with `runGate`, and it loses the `execFileFn` DI seam every existing
   test injects.

## Decision

Fix it in this change: `runSubprocess` **ends the returned child's stdin** rather than
relying on an option `execFile` does not honour.

The rule this establishes: **a subprocess option is proven by observing its effect on a
real child process, never by asserting it was passed to a spy.** A test that asserts an
options object was constructed proves the caller's intent and nothing about the runtime.
Where the two can diverge — and `execFile`/`stdio` is a live instance — only an effect
test is evidence.

`adapters/pi/test/run.test.js:488` and `:717` may keep asserting construction as a
contract check on the caller, but they no longer count as coverage of the behaviour; the
effect test does.

## Consequences

- `runSubprocess` changes in `adapters/pi/src/run.js`; `runGate` shares it and inherits
  the fix.
- A new test spawns a real stdin-blocked child, so it runs anywhere Node runs — no agent
  binary required, and it is not subject to ADR-345's ambient concern.
- The `execFileFn` injection seam is preserved, so no existing test rewires.
- Any other `execFile` call site passing `stdio` in this repo is suspect by the same
  measurement and should be checked.
